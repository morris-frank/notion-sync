import { describe, expect, it } from "vitest";
import { titleForSync } from "../src/title";

describe("opinionated Notion titles", () => {
  it("drops an ISO date prefix and its separator", () => {
    expect(titleForSync("2026-07-19 tldv — AI meeting notetaker vendor eval")).toBe(
      "tldv — AI meeting notetaker vendor eval"
    );
    expect(titleForSync("2026-07-19 — Field note")).toBe("Field note");
  });

  it("leaves non-prefixed and date-only names intact", () => {
    expect(titleForSync("Field note 2026-07-19")).toBe("Field note 2026-07-19");
    expect(titleForSync("2026-07-19")).toBe("2026-07-19");
  });
});
