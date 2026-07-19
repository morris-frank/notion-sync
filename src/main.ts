import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, type NotionSyncSettings } from "./types";
import { NotionApi } from "./notion-api";
import { NotionSyncSettingTab } from "./settings";
import { SyncEngine } from "./sync-engine";
import { hasSyncFrontmatter, removeSyncFrontmatter } from "./frontmatter";

export default class NotionSyncPlugin extends Plugin {
  override settings: NotionSyncSettings = DEFAULT_SETTINGS;
  private engine!: SyncEngine;
  private statusEl: HTMLElement | null = null;
  private saveTimers = new Map<string, number>();
  private pollTimer: number | null = null;

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("notion-sync-status");
    this.setStatus("Notion Sync ready");
    this.engine = new SyncEngine(
      this.app,
      () => this.settings,
      (message, error) => this.setStatus(message, error)
    );
    this.addSettingTab(new NotionSyncSettingTab(this.app, this));

    this.addCommand({
      id: "sync-current-note",
      name: "Sync current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.engine.syncFile(file);
        return true;
      }
    });
    this.addCommand({
      id: "sync-all-notes",
      name: "Sync all opted-in notes",
      callback: () => {
        void this.engine.syncAll();
      }
    });
    this.addCommand({
      id: "open-linked-notion-page",
      name: "Open linked Notion page",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const url = file
          ? (this.app.metadataCache.getFileCache(file)?.frontmatter?.notion_page_url as unknown)
          : undefined;
        if (typeof url !== "string") return false;
        if (!checking) window.open(url);
        return true;
      }
    });
    this.addCommand({
      id: "remove-notion-sync-current-note",
      name: "Remove Notion sync from current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md" || this.engine.isBusy(file.path)) return false;
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as
          Record<string, unknown> | undefined;
        if (!hasSyncFrontmatter(frontmatter, this.settings)) return false;
        if (!checking) void this.removeNotionSync(file);
        return true;
      }
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (
          !(file instanceof TFile) ||
          file.extension !== "md" ||
          !this.settings.pushOnSave ||
          this.engine.isBusy(file.path)
        )
          return;
        this.scheduleFileSync(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        if (file instanceof TFile && file.extension === "md" && this.settings.pushOnSave) this.scheduleFileSync(file);
      })
    );
    this.configurePolling();
  }

  override onunload(): void {
    for (const timer of this.saveTimers.values()) window.clearTimeout(timer);
    this.saveTimers.clear();
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
  }

  private async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<NotionSyncSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.engine?.invalidateConfiguration();
    this.configurePolling();
  }

  private configurePolling(): void {
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    const minutes = this.settings.pollIntervalMinutes;
    if (minutes > 0) {
      this.pollTimer = window.setInterval(() => {
        void this.engine.syncAll(false);
      }, minutes * 60_000);
      this.registerInterval(this.pollTimer);
    }
  }

  private scheduleFileSync(file: TFile): void {
    const previous = this.saveTimers.get(file.path);
    if (previous) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      this.saveTimers.delete(file.path);
      void this.engine.syncFile(file, false).catch(() => undefined);
    }, 2000);
    this.saveTimers.set(file.path, timer);
  }

  private setStatus(message: string, error = false): void {
    if (!this.statusEl) return;
    this.statusEl.setText(message);
    this.statusEl.toggleClass("notion-sync-status-error", error);
    this.statusEl.setAttribute("aria-label", message);
  }

  private async removeNotionSync(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        removeSyncFrontmatter(frontmatter, this.settings);
      });
      const message = `${file.basename}: removed Notion sync metadata`;
      this.setStatus(message);
      new Notice(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`Failed to remove Notion sync: ${message}`, true);
      new Notice(`Notion Sync: ${message}`, 8000);
    }
  }

  async testConnection(): Promise<void> {
    if (!this.settings.dataSourceId.trim()) throw new Error("Data source ID is missing");
    await new NotionApi(this.settings.notionToken).retrieveDataSource(this.settings.dataSourceId.trim());
    new Notice("Notion Sync: connection successful");
  }
}
