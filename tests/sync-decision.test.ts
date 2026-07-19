import { describe, expect, it } from "vitest";
import { decideExistingPageDirection } from "../src/sync-decision";

const base = {
  pending: false,
  localChanged: false,
  remoteChanged: false,
  localModifiedAt: "2026-07-19T10:00:00Z",
  remoteEditedAt: "2026-07-19T09:00:00Z"
};

describe("two-way sync decision", () => {
  it("routes one-sided and unchanged states", () => {
    expect(decideExistingPageDirection(base)).toBe("unchanged");
    expect(decideExistingPageDirection({ ...base, localChanged: true })).toBe("push");
    expect(decideExistingPageDirection({ ...base, remoteChanged: true })).toBe("pull");
  });

  it("uses the newest edit when both sides changed", () => {
    expect(decideExistingPageDirection({ ...base, localChanged: true, remoteChanged: true })).toBe("push");
    expect(decideExistingPageDirection({
      ...base, localChanged: true, remoteChanged: true,
      localModifiedAt: "2026-07-19T08:00:00Z"
    })).toBe("pull");
  });

  it("always repairs an incompletely-created linked page from Obsidian", () => {
    expect(decideExistingPageDirection({ ...base, pending: true, remoteChanged: true })).toBe("push");
  });
});
