import { requestUrl } from "obsidian";
import type { NotionBlock, NotionPage, NotionPropertySchema, NotionPropertyValue } from "./types";
import { NOTION_API_VERSION } from "./types";

interface ListResponse<T> { results: T[]; has_more: boolean; next_cursor: string | null; }

export class NotionApi {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    if (!this.token.trim()) throw new Error("Notion token is not configured");
    const response = await requestUrl({
      url: `https://api.notion.com/v1${path}`,
      method,
      headers: {
        Authorization: `Bearer ${this.token.trim()}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      throw: false
    });
    if (response.status < 200 || response.status >= 300) {
      const message = (response.json as { message?: string } | undefined)?.message ?? response.text ?? `HTTP ${response.status}`;
      throw new Error(`Notion API: ${message}`);
    }
    return response.json as T;
  }

  async retrieveDataSource(dataSourceId: string): Promise<Record<string, NotionPropertySchema>> {
    const source = await this.request<{ properties: Record<string, NotionPropertySchema> }>(`/data_sources/${dataSourceId}`);
    return source.properties;
  }

  retrievePage(pageId: string): Promise<NotionPage> {
    return this.request<NotionPage>(`/pages/${pageId}`);
  }

  async retrieveBlocks(blockId: string): Promise<NotionBlock[]> {
    const output: NotionBlock[] = [];
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ page_size: "100" });
      if (cursor) query.set("start_cursor", cursor);
      const response = await this.request<ListResponse<NotionBlock>>(`/blocks/${blockId}/children?${query.toString()}`);
      for (const block of response.results) {
        if (block.has_children && block.id) block.children = await this.retrieveBlocks(block.id);
        output.push(block);
      }
      cursor = response.has_more ? response.next_cursor : null;
    } while (cursor);
    return output;
  }

  createPage(dataSourceId: string, properties: Record<string, NotionPropertyValue>): Promise<NotionPage> {
    return this.request<NotionPage>("/pages", "POST", {
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties
    });
  }

  async appendBlocks(pageId: string, children: NotionBlock[]): Promise<void> {
    for (let index = 0; index < children.length; index += 100) {
      await this.request(`/blocks/${pageId}/children`, "PATCH", { children: children.slice(index, index + 100) });
    }
  }

  async replacePage(
    pageId: string,
    properties: Record<string, NotionPropertyValue>,
    children: NotionBlock[],
    previousBlockIds: string[]
  ): Promise<NotionPage> {
    await this.appendBlocks(pageId, children);
    await this.request<NotionPage>(`/pages/${pageId}`, "PATCH", { properties });
    for (const blockId of previousBlockIds) await this.request(`/blocks/${blockId}`, "DELETE");
    return this.retrievePage(pageId);
  }
}
