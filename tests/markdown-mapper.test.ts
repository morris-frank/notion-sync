import { describe, expect, it } from "vitest";
import { blocksToMarkdown, markdownToBlocks, markdownToRichText, richTextToMarkdown, unsupportedBlocks, validateWritableBlocks } from "../src/markdown-mapper";

describe("opinionated markdown mapping", () => {
  it("round-trips the supported block vocabulary", () => {
    const markdown = [
      "# Heading", "", "A **bold** paragraph.", "", "- one", "", "- [x] done", "",
      "> [!warning] Careful", "> Keep the source note.", "", "```typescript", "const answer = 42;", "```", "", "---", ""
    ].join("\n");
    const blocks = markdownToBlocks(markdown);
    expect(blocks.map((block) => block.type)).toEqual([
      "heading_1", "paragraph", "bulleted_list_item", "to_do", "callout", "code", "divider"
    ]);
    expect(blocksToMarkdown(blocks)).toBe(markdown);
  });

  it("maps inline emphasis, code, and links", () => {
    const input = "Use **bold**, *italics*, `code`, ~~old~~ and [docs](https://example.com).";
    expect(richTextToMarkdown(markdownToRichText(input))).toBe(input);
  });

  it("identifies block types that a full replacement must protect", () => {
    expect(unsupportedBlocks([
      { type: "paragraph", paragraph: {} },
      { type: "image", image: {} },
      { type: "column_list", children: [{ type: "paragraph", paragraph: {} }] }
    ])).toEqual(["image", "column_list"]);
  });

  it("chunks long text and rejects too many rich-text spans before writing", () => {
    const chunks = markdownToRichText("a".repeat(4500));
    expect(chunks.map((item) => item.text?.content.length)).toEqual([2000, 2000, 500]);
    expect(() => validateWritableBlocks([{
      type: "paragraph",
      paragraph: { rich_text: Array.from({ length: 101 }, () => ({ text: { content: "x" } })) }
    }])).toThrow("more than 100");
  });
});
