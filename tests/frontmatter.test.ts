import { describe, expect, it } from "vitest";
import { hasSyncFrontmatter, removeSyncFrontmatter } from "../src/frontmatter";
import { DEFAULT_SETTINGS, SYNC_FIELDS } from "../src/types";

describe("removeSyncFrontmatter", () => {
  it("removes the configured opt-in and every technical sync field", () => {
    const frontmatter: Record<string, unknown> = {
      publish_to_notion: true,
      tags: ["soil"],
      date: "2026-07-19",
      [SYNC_FIELDS.pageId]: "page-id",
      [SYNC_FIELDS.pageUrl]: "https://notion.so/page-id",
      [SYNC_FIELDS.lastSyncedAt]: "2026-07-19T10:00:00.000Z",
      [SYNC_FIELDS.localHash]: "hash",
      [SYNC_FIELDS.remoteEditedAt]: "2026-07-19T10:00:00.000Z",
      [SYNC_FIELDS.pending]: true
    };

    const removed = removeSyncFrontmatter(frontmatter, {
      ...DEFAULT_SETTINGS,
      optInProperty: "publish_to_notion"
    });

    expect(new Set(removed)).toEqual(new Set(["publish_to_notion", ...Object.values(SYNC_FIELDS)]));
    expect(frontmatter).toEqual({ tags: ["soil"], date: "2026-07-19" });
    expect(hasSyncFrontmatter(frontmatter, { ...DEFAULT_SETTINGS, optInProperty: "publish_to_notion" })).toBe(false);
  });

  it("is idempotent and does not remove user frontmatter", () => {
    const frontmatter: Record<string, unknown> = { tags: ["soil"], status: "Draft" };

    expect(removeSyncFrontmatter(frontmatter, DEFAULT_SETTINGS)).toEqual([]);
    expect(frontmatter).toEqual({ tags: ["soil"], status: "Draft" });
    expect(hasSyncFrontmatter(undefined, DEFAULT_SETTINGS)).toBe(false);
  });
});
