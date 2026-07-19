import { describe, expect, it } from "vitest";
import {
  blocksToMarkdown,
  markdownToBlocks,
  markdownToRichText,
  richTextToMarkdown,
  unsupportedBlocks,
  validateWritableBlocks
} from "../src/markdown-mapper";

describe("opinionated markdown mapping", () => {
  it("round-trips the supported block vocabulary", () => {
    const markdown = [
      "# Heading",
      "",
      "A **bold** paragraph.",
      "",
      "- one",
      "",
      "- [x] done",
      "",
      "> [!warning] Careful",
      "> Keep the source note.",
      "",
      "```typescript",
      "const answer = 42;",
      "```",
      "",
      "---",
      ""
    ].join("\n");
    const blocks = markdownToBlocks(markdown);
    expect(blocks.map((block) => block.type)).toEqual([
      "heading_1",
      "paragraph",
      "bulleted_list_item",
      "to_do",
      "callout",
      "code",
      "divider"
    ]);
    expect(blocksToMarkdown(blocks)).toBe(markdown);
  });

  it("maps inline emphasis, code, and links", () => {
    const input = "Use **bold**, *italics*, `code`, ~~old~~ and [docs](https://example.com).";
    expect(richTextToMarkdown(markdownToRichText(input))).toBe(input);
  });

  it("preserves nested italics inside a long bold verdict", () => {
    const input = "**Verdict passes through *tldx Solutions GmbH* and remains bold.**";
    const richText = markdownToRichText(input);
    expect(richText.every((item) => item.annotations?.bold)).toBe(true);
    expect(richText.some((item) => item.annotations?.italic)).toBe(true);
    expect(richText.map((item) => item.text?.content).join("")).toBe(
      "Verdict passes through tldx Solutions GmbH and remains bold."
    );
  });

  it("maps callout content to typed bold labels and nested blocks", () => {
    const markdown = [
      "> [!question]",
      "> # [tl;dv](https://tldv.io/)",
      "> Vendor screen with **important context**.",
      "> - First gate"
    ].join("\n");
    const [callout] = markdownToBlocks(markdown);
    expect(callout?.type).toBe("callout");
    const data = callout?.callout as {
      rich_text: Array<{ annotations?: { bold?: boolean } }>;
      children: Array<{ type: string }>;
    };
    expect(data.rich_text[0]?.annotations?.bold).toBe(true);
    expect(data.children.map((child) => child.type)).toEqual(["heading_1", "paragraph", "bulleted_list_item"]);
    expect(blocksToMarkdown([callout!])).toBe(
      [
        "> [!question]",
        "> # [tl;dv](https://tldv.io/)",
        ">",
        "> Vendor screen with **important context**.",
        ">",
        "> - First gate",
        ""
      ].join("\n")
    );
  });

  it("round-trips Markdown tables as native Notion table blocks", () => {
    const markdown = [
      "| Check | Status | Detail |",
      "| --- | --- | --- |",
      "| EU-headquartered | ✅ Yes | **German entity** |",
      "| AI hosting | ⚠️ Verify | [Security](https://example.com) |",
      ""
    ].join("\n");
    const [table] = markdownToBlocks(markdown);
    expect(table?.type).toBe("table");
    const data = table?.table as { table_width: number; has_column_header: boolean; children: Array<{ type: string }> };
    expect(data).toMatchObject({ table_width: 3, has_column_header: true });
    expect(data.children).toHaveLength(3);
    expect(data.children.every((child) => child.type === "table_row")).toBe(true);
    expect(blocksToMarkdown([table!])).toBe(markdown);
  });

  it("identifies block types that a full replacement must protect", () => {
    expect(
      unsupportedBlocks([
        { type: "paragraph", paragraph: {} },
        { type: "image", image: {} },
        { type: "column_list", children: [{ type: "paragraph", paragraph: {} }] }
      ])
    ).toEqual(["image", "column_list"]);
  });

  it("chunks long text and rejects too many rich-text spans before writing", () => {
    const chunks = markdownToRichText("a".repeat(4500));
    expect(chunks.map((item) => item.text?.content.length)).toEqual([2000, 2000, 500]);
    expect(() =>
      validateWritableBlocks([
        {
          type: "paragraph",
          paragraph: { rich_text: Array.from({ length: 101 }, () => ({ text: { content: "x" } })) }
        }
      ])
    ).toThrow("more than 100");
  });
});
