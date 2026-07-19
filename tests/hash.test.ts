import { describe, expect, it } from "vitest";
import { contentHash, stableStringify } from "../src/hash";

describe("sync snapshots", () => {
  it("are stable across object key order", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
    expect(contentHash({ body: "x", properties: { b: 2, a: 1 } })).toBe(
      contentHash({ properties: { a: 1, b: 2 }, body: "x" })
    );
  });
});
