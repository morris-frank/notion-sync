import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { NotionApi } from "../src/notion-api";

const requestUrlMock = vi.mocked(requestUrl);

function ok(json: unknown = {}): { status: number; json: unknown; text: string } {
  return { status: 200, json, text: "" };
}

describe("Notion API write sequencing", () => {
  beforeEach(() => requestUrlMock.mockReset().mockResolvedValue(ok({}) as never));

  it("creates a page under the configured data source", async () => {
    requestUrlMock.mockResolvedValueOnce(
      ok({ id: "page-1", last_edited_time: "2026-07-19T10:00:00Z", properties: {} }) as never
    );
    await new NotionApi("secret").createPage("source-1", { Name: { title: [] } });
    expect(requestUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://api.notion.com/v1/pages",
        method: "POST",
        headers: expect.objectContaining({ "Notion-Version": "2026-03-11", Authorization: "Bearer secret" }),
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: "source-1" },
          properties: { Name: { title: [] } }
        })
      })
    );
  });

  it("chunks appends at the API's 100-block boundary", async () => {
    const children = Array.from({ length: 205 }, () => ({ type: "divider", divider: {} }));
    await new NotionApi("secret").appendBlocks("page-1", children);
    expect(requestUrlMock).toHaveBeenCalledTimes(3);
    const bodies = requestUrlMock.mock.calls.map(
      ([request]) => JSON.parse((request as { body: string }).body) as { children: unknown[] }
    );
    expect(bodies.map((body) => body.children.length)).toEqual([100, 100, 5]);
  });

  it("bulk-clears once before appending the replacement", async () => {
    requestUrlMock
      .mockResolvedValueOnce(ok({}) as never)
      .mockResolvedValueOnce(ok({}) as never)
      .mockResolvedValueOnce(ok({ id: "page-1", last_edited_time: "2026-07-19T10:00:00Z", properties: {} }) as never);
    await new NotionApi("secret").replacePage("page-1", { Name: { title: [] } }, [
      { type: "paragraph", paragraph: { rich_text: [] } }
    ]);
    expect(
      requestUrlMock.mock.calls.map(
        ([request]) => `${(request as { method: string }).method} ${(request as { url: string }).url}`
      )
    ).toEqual([
      "PATCH https://api.notion.com/v1/pages/page-1",
      "PATCH https://api.notion.com/v1/blocks/page-1/children",
      "GET https://api.notion.com/v1/pages/page-1"
    ]);
    expect(JSON.parse((requestUrlMock.mock.calls[0]?.[0] as { body: string }).body)).toMatchObject({
      erase_content: true
    });
  });
});
