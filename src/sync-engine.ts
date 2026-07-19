import { Notice, type App, type TFile } from "obsidian";
import { makeSnapshot, isOptedIn } from "./frontmatter";
import { blocksToMarkdown, markdownToBlocks, unsupportedBlocks, validateWritableBlocks } from "./markdown-mapper";
import { NotionApi } from "./notion-api";
import { frontmatterFromPage, propertiesForPush } from "./property-mapper";
import { decideExistingPageDirection } from "./sync-decision";
import type { NoteSnapshot, NotionPage, NotionPropertySchema, NotionSyncSettings, SyncResult } from "./types";
import { SYNC_FIELDS } from "./types";

export type StatusCallback = (message: string, error?: boolean) => void;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export class SyncEngine {
  private readonly activeFiles = new Set<string>();
  private schemas: Record<string, NotionPropertySchema> | null = null;
  private schemaDataSourceId = "";

  constructor(
    private readonly app: App,
    private readonly getSettings: () => NotionSyncSettings,
    private readonly setStatus: StatusCallback
  ) {}

  isBusy(path: string): boolean { return this.activeFiles.has(path); }

  private api(): NotionApi { return new NotionApi(this.getSettings().notionToken); }

  private async getSchemas(api: NotionApi): Promise<Record<string, NotionPropertySchema>> {
    const id = this.getSettings().dataSourceId.trim();
    if (!id) throw new Error("Notion data source ID is not configured");
    if (!this.schemas || this.schemaDataSourceId !== id) {
      this.schemas = await api.retrieveDataSource(id);
      this.schemaDataSourceId = id;
    }
    return this.schemas;
  }

  invalidateConfiguration(): void { this.schemas = null; }

  private async readSnapshot(file: TFile): Promise<NoteSnapshot> {
    return makeSnapshot(file, await this.app.vault.read(file), this.getSettings());
  }

  async syncFile(file: TFile, notify = true): Promise<SyncResult> {
    if (this.activeFiles.has(file.path)) return { direction: "skipped", message: `${file.basename}: already syncing` };
    this.activeFiles.add(file.path);
    this.setStatus(`Syncing ${file.basename}…`);
    try {
      const snapshot = await this.readSnapshot(file);
      if (!isOptedIn(snapshot.frontmatter, this.getSettings())) {
        return { direction: "skipped", message: `${file.basename}: not opted in` };
      }
      const result = await this.syncSnapshot(snapshot);
      this.setStatus(result.message);
      if (notify) new Notice(result.message);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`Sync failed: ${message}`, true);
      if (notify) new Notice(`Notion Sync: ${message}`, 8000);
      throw error;
    } finally {
      this.activeFiles.delete(file.path);
    }
  }

  private async syncSnapshot(local: NoteSnapshot): Promise<SyncResult> {
    const settings = this.getSettings();
    const api = this.api();
    const schemas = await this.getSchemas(api);
    const pageId = asString(local.frontmatter[SYNC_FIELDS.pageId]);
    if (!pageId) return this.createFromLocal(api, schemas, local);

    const remote = await api.retrievePage(pageId);
    if (remote.in_trash) throw new Error("The linked Notion page is in trash; restore it or turn off notion_sync");
    const lastLocalHash = asString(local.frontmatter[SYNC_FIELDS.localHash]);
    const lastRemoteEdit = asString(local.frontmatter[SYNC_FIELDS.remoteEditedAt]);
    const localChanged = !lastLocalHash || local.hash !== lastLocalHash;
    const remoteChanged = !lastRemoteEdit || remote.last_edited_time !== lastRemoteEdit;
    const direction = decideExistingPageDirection({
      pending: local.frontmatter[SYNC_FIELDS.pending] === true,
      localChanged, remoteChanged,
      localModifiedAt: local.modifiedAt,
      remoteEditedAt: remote.last_edited_time
    });
    if (direction === "push") return this.pushToRemote(api, schemas, local, remote);
    if (direction === "pull") return this.pullFromRemote(api, local, remote);
    return { direction: "unchanged", message: `${local.file.basename}: up to date` };
  }

  private pageProperties(local: NoteSnapshot, schemas: Record<string, NotionPropertySchema>): ReturnType<typeof propertiesForPush> {
    return propertiesForPush(local.file.basename, local.frontmatter, schemas, this.getSettings());
  }

  private async createFromLocal(
    api: NotionApi,
    schemas: Record<string, NotionPropertySchema>,
    local: NoteSnapshot
  ): Promise<SyncResult> {
    const blocks = markdownToBlocks(local.body);
    validateWritableBlocks(blocks);
    const page = await api.createPage(this.getSettings().dataSourceId.trim(), this.pageProperties(local, schemas));
    await this.recordLink(local.file, page);
    await api.appendBlocks(page.id, blocks);
    const completedPage = await api.retrievePage(page.id);
    await this.recordSync(local.file, completedPage, local.hash);
    return { direction: "created", message: `${local.file.basename}: created in Notion` };
  }

  private async pushToRemote(
    api: NotionApi,
    schemas: Record<string, NotionPropertySchema>,
    local: NoteSnapshot,
    remote: NotionPage
  ): Promise<SyncResult> {
    const nextBlocks = markdownToBlocks(local.body);
    validateWritableBlocks(nextBlocks);
    const existingBlocks = await api.retrieveBlocks(remote.id);
    const unsupported = unsupportedBlocks(existingBlocks);
    if (unsupported.length) {
      throw new Error(`Push stopped: Notion page contains protected block type(s): ${unsupported.join(", ")}`);
    }
    const previousBlockIds = existingBlocks.map((block) => block.id).filter((id): id is string => typeof id === "string");
    if (previousBlockIds.length !== existingBlocks.length) throw new Error("Push stopped: Notion returned a block without an ID");
    await this.markPending(local.file);
    const page = await api.replacePage(remote.id, this.pageProperties(local, schemas), nextBlocks, previousBlockIds);
    await this.recordSync(local.file, page, local.hash);
    return { direction: "pushed", message: `${local.file.basename}: pushed to Notion` };
  }

  private async pullFromRemote(api: NotionApi, local: NoteSnapshot, remote: NotionPage): Promise<SyncResult> {
    const blocks = await api.retrieveBlocks(remote.id);
    const unsupported = unsupportedBlocks(blocks);
    if (unsupported.length) {
      throw new Error(`Pull stopped: Notion page contains unsupported block type(s): ${unsupported.join(", ")}`);
    }
    const body = blocksToMarkdown(blocks);
    const pulledProperties = frontmatterFromPage(remote, this.getSettings());
    await this.writeRemoteVersion(local.file, body, pulledProperties, remote);
    return { direction: "pulled", message: `${local.file.basename}: pulled from Notion` };
  }

  private async recordSync(file: TFile, page: NotionPage, localHash: string): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[SYNC_FIELDS.pageId] = page.id;
      if (page.url) frontmatter[SYNC_FIELDS.pageUrl] = page.url;
      frontmatter[SYNC_FIELDS.lastSyncedAt] = new Date().toISOString();
      frontmatter[SYNC_FIELDS.localHash] = localHash;
      frontmatter[SYNC_FIELDS.remoteEditedAt] = page.last_edited_time;
      delete frontmatter[SYNC_FIELDS.pending];
    });
  }

  private async recordLink(file: TFile, page: NotionPage): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[SYNC_FIELDS.pageId] = page.id;
      if (page.url) frontmatter[SYNC_FIELDS.pageUrl] = page.url;
      frontmatter[SYNC_FIELDS.remoteEditedAt] = page.last_edited_time;
      frontmatter[SYNC_FIELDS.pending] = true;
    });
  }

  private async markPending(file: TFile): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[SYNC_FIELDS.pending] = true;
    });
  }

  private async writeRemoteVersion(
    file: TFile,
    body: string,
    properties: Record<string, unknown>,
    remote: NotionPage
  ): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      for (const [key, value] of Object.entries(properties)) frontmatter[key] = value;
      frontmatter[SYNC_FIELDS.pageId] = remote.id;
      if (remote.url) frontmatter[SYNC_FIELDS.pageUrl] = remote.url;
      frontmatter[SYNC_FIELDS.lastSyncedAt] = new Date().toISOString();
      frontmatter[SYNC_FIELDS.remoteEditedAt] = remote.last_edited_time;
    });
    const withUpdatedFrontmatter = await this.app.vault.read(file);
    const marker = withUpdatedFrontmatter.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? "";
    const normalizedBody = body ? `${body.trimEnd()}\n` : "";
    await this.app.vault.modify(file, `${marker}${normalizedBody}`);
    const finalText = await this.app.vault.read(file);
    const finalSnapshot = makeSnapshot(file, finalText, this.getSettings());
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[SYNC_FIELDS.localHash] = finalSnapshot.hash;
    });
  }

  async syncAll(notify = true): Promise<{ synced: number; failed: number; skipped: number }> {
    const files = this.app.vault.getMarkdownFiles();
    let synced = 0;
    let failed = 0;
    let skipped = 0;
    for (const file of files) {
      try {
        const snapshot = await this.readSnapshot(file);
        if (!isOptedIn(snapshot.frontmatter, this.getSettings())) { skipped += 1; continue; }
        const result = await this.syncFile(file, false);
        if (result.direction === "skipped") skipped += 1;
        else synced += 1;
      } catch { failed += 1; }
    }
    const message = `Notion Sync: ${synced} checked, ${failed} failed, ${skipped} not opted in`;
    this.setStatus(message, failed > 0);
    if (notify) new Notice(message, failed ? 8000 : 4000);
    return { synced, failed, skipped };
  }
}
