import type { TFile } from "obsidian";

export const NOTION_API_VERSION = "2026-03-11";

export interface NotionSyncSettings {
  notionToken: string;
  dataSourceId: string;
  optInProperty: string;
  titleProperty: string;
  frontmatterKeys: string[];
  propertyMap: Record<string, string>;
  pollIntervalMinutes: number;
  pushOnSave: boolean;
}

export const DEFAULT_SETTINGS: NotionSyncSettings = {
  notionToken: "",
  dataSourceId: "",
  optInProperty: "notion_sync",
  titleProperty: "Name",
  frontmatterKeys: ["tags", "status", "date"],
  propertyMap: {},
  pollIntervalMinutes: 5,
  pushOnSave: true
};

export const SYNC_FIELDS = {
  pageId: "notion_page_id",
  pageUrl: "notion_page_url",
  lastSyncedAt: "notion_last_synced_at",
  localHash: "notion_local_hash",
  remoteEditedAt: "notion_remote_edited_at",
  pending: "notion_sync_pending"
} as const;

export interface NoteSnapshot {
  file: TFile;
  body: string;
  frontmatter: Record<string, unknown>;
  hash: string;
  modifiedAt: string;
}

export interface NotionPage {
  id: string;
  url?: string;
  last_edited_time: string;
  in_trash?: boolean;
  properties: Record<string, NotionPropertyValue>;
}

export interface NotionPropertySchema {
  id: string;
  name: string;
  type: string;
}

export type RichText = {
  type?: string;
  plain_text?: string;
  href?: string | null;
  text?: { content: string; link?: { url: string } | null };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
};

export type NotionPropertyValue = Record<string, unknown> & { type?: string };
export type NotionBlock = Record<string, unknown> & {
  id?: string;
  type: string;
  has_children?: boolean;
  children?: NotionBlock[];
};

export interface SyncResult {
  direction: "created" | "pushed" | "pulled" | "unchanged" | "skipped";
  message: string;
}
