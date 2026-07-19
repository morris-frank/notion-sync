import { parseYaml } from "obsidian";
import { contentHash } from "./hash";
import { titleForSync } from "./title";
import type { NoteSnapshot, NotionSyncSettings } from "./types";
import { SYNC_FIELDS } from "./types";

export function splitFrontmatter(markdown: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) {
    return { frontmatter: {}, body: markdown };
  }
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { frontmatter: {}, body: markdown };
  const parsed = parseYaml(match[1] ?? "");
  return {
    frontmatter: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {},
    body: markdown.slice(match[0].length)
  };
}

export function isOptedIn(frontmatter: Record<string, unknown>, settings: NotionSyncSettings): boolean {
  return frontmatter[settings.optInProperty] === true;
}

function syncFrontmatterKeys(settings: NotionSyncSettings): string[] {
  return [...new Set([settings.optInProperty, ...Object.values(SYNC_FIELDS)])];
}

export function hasSyncFrontmatter(
  frontmatter: Record<string, unknown> | undefined,
  settings: NotionSyncSettings
): boolean {
  return frontmatter !== undefined && syncFrontmatterKeys(settings).some((key) => key in frontmatter);
}

export function removeSyncFrontmatter(frontmatter: Record<string, unknown>, settings: NotionSyncSettings): string[] {
  const removed: string[] = [];
  for (const key of syncFrontmatterKeys(settings)) {
    if (!(key in frontmatter)) continue;
    delete frontmatter[key];
    removed.push(key);
  }
  return removed;
}

export function selectedFrontmatter(
  frontmatter: Record<string, unknown>,
  settings: NotionSyncSettings
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const key of settings.frontmatterKeys) {
    if (key in frontmatter && !Object.values(SYNC_FIELDS).includes(key as never)) selected[key] = frontmatter[key];
  }
  return selected;
}

export function snapshotHash(
  title: string,
  body: string,
  frontmatter: Record<string, unknown>,
  settings: NotionSyncSettings
): string {
  return contentHash({ title, body: body.trimEnd(), properties: selectedFrontmatter(frontmatter, settings) });
}

export function makeSnapshot(file: NoteSnapshot["file"], markdown: string, settings: NotionSyncSettings): NoteSnapshot {
  const { frontmatter, body } = splitFrontmatter(markdown);
  return {
    file,
    body,
    frontmatter,
    hash: snapshotHash(titleForSync(file.basename), body, frontmatter, settings),
    modifiedAt: new Date(file.stat.mtime).toISOString()
  };
}
