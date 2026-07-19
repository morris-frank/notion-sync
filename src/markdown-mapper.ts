import type { NotionBlock, RichText } from "./types";

const CALLOUT_EMOJI: Record<string, string> = {
  note: "📝",
  info: "ℹ️",
  tip: "💡",
  hint: "💡",
  summary: "📋",
  abstract: "📄",
  todo: "☑️",
  success: "✅",
  question: "❓",
  warning: "⚠️",
  failure: "❌",
  danger: "🔥",
  bug: "🐛",
  example: "📚",
  quote: "💬"
};
const EMOJI_CALLOUT = Object.fromEntries(Object.entries(CALLOUT_EMOJI).map(([key, value]) => [value, key]));

function textObject(content: string, annotations: RichText["annotations"] = {}, url?: string): RichText {
  return {
    type: "text",
    text: { content, link: url ? { url } : null },
    annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, ...annotations }
  };
}

export function markdownToRichText(markdown: string): RichText[] {
  const parse = (input: string, inherited: RichText["annotations"] = {}): RichText[] => {
    const result: RichText[] = [];
    const pattern = /(\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|_[^_]+_)/g;
    let cursor = 0;
    for (const match of input.matchAll(pattern)) {
      const start = match.index ?? 0;
      if (start > cursor) result.push(textObject(input.slice(cursor, start), inherited));
      const token = match[0];
      if (token.startsWith("**") || token.startsWith("__")) {
        result.push(...parse(token.slice(2, -2), { ...inherited, bold: true }));
      } else if (token.startsWith("~~")) {
        result.push(...parse(token.slice(2, -2), { ...inherited, strikethrough: true }));
      } else if (token.startsWith("`")) {
        result.push(textObject(token.slice(1, -1), { ...inherited, code: true }));
      } else if (token.startsWith("[") && token.includes("](")) {
        const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        result.push(textObject(link?.[1] ?? token, inherited, link?.[2]));
      } else {
        result.push(...parse(token.slice(1, -1), { ...inherited, italic: true }));
      }
      cursor = start + token.length;
    }
    if (cursor < input.length) result.push(textObject(input.slice(cursor), inherited));
    return result;
  };
  const result = parse(markdown);
  const chunked = result.flatMap((item) => {
    const content = item.text?.content ?? "";
    if (!content) return [item];
    const chunks: RichText[] = [];
    for (let index = 0; index < content.length; index += 2000) {
      chunks.push({ ...item, text: { ...item.text, content: content.slice(index, index + 2000) } });
    }
    return chunks;
  });
  return chunked.length ? chunked : [textObject("")];
}

export function richTextToMarkdown(richText: RichText[]): string {
  return richText
    .map((item) => {
      let text = item.plain_text ?? item.text?.content ?? "";
      const annotations = item.annotations ?? {};
      if (annotations.code) text = `\`${text}\``;
      if (annotations.bold) text = `**${text}**`;
      if (annotations.italic) text = `*${text}*`;
      if (annotations.strikethrough) text = `~~${text}~~`;
      const url = item.href ?? item.text?.link?.url;
      return url ? `[${text}](${url})` : text;
    })
    .join("");
}

function richTextBlock(type: string, text: string, extra: Record<string, unknown> = {}): NotionBlock {
  return { object: "block", type, [type]: { rich_text: markdownToRichText(text), color: "default", ...extra } };
}

const CODE_LANGUAGES = new Set([
  "abap",
  "arduino",
  "bash",
  "basic",
  "c",
  "clojure",
  "coffeescript",
  "c++",
  "c#",
  "css",
  "dart",
  "diff",
  "docker",
  "elixir",
  "elm",
  "erlang",
  "flow",
  "fortran",
  "f#",
  "gherkin",
  "glsl",
  "go",
  "graphql",
  "groovy",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "julia",
  "kotlin",
  "latex",
  "less",
  "lisp",
  "lua",
  "makefile",
  "markdown",
  "markup",
  "matlab",
  "mermaid",
  "nix",
  "objective-c",
  "ocaml",
  "pascal",
  "perl",
  "php",
  "plain text",
  "powershell",
  "prolog",
  "protobuf",
  "python",
  "r",
  "reason",
  "ruby",
  "rust",
  "sass",
  "scala",
  "scheme",
  "scss",
  "shell",
  "sql",
  "swift",
  "typescript",
  "vb.net",
  "verilog",
  "vhdl",
  "visual basic",
  "webassembly",
  "xml",
  "yaml",
  "java/c/c++/c#"
]);
const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  "": "plain text",
  text: "plain text",
  txt: "plain text",
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  sh: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  tex: "latex",
  cpp: "c++",
  cs: "c#"
};

function notionCodeLanguage(language: string): string {
  const normalized = language.toLowerCase();
  const aliased = CODE_LANGUAGE_ALIASES[normalized] ?? normalized;
  return CODE_LANGUAGES.has(aliased) ? aliased : "plain text";
}

function parseCallout(lines: string[], start: number): { block: NotionBlock; end: number } | null {
  const first = lines[start]?.match(/^>\s*\[!([\w-]+)\](?:[+-])?\s*(.*)$/i);
  if (!first) return null;
  const kind = (first[1] ?? "note").toLowerCase();
  const typeLabel = `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)}`;
  const customTitle = first[2]?.trim() ?? "";
  const label = customTitle ? `${typeLabel} — ${customTitle}` : typeLabel;
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length && /^>/.test(lines[index] ?? "")) {
    body.push((lines[index] ?? "").replace(/^>\s?/, ""));
    index += 1;
  }
  const children = markdownToBlocks(body.join("\n"));
  return {
    block: {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [textObject(label, { bold: true })],
        icon: { type: "emoji", emoji: CALLOUT_EMOJI[kind] ?? CALLOUT_EMOJI.note },
        color: "default",
        children
      }
    },
    end: index
  };
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTable(lines: string[], start: number): { block: NotionBlock; end: number } | null {
  const headerLine = lines[start] ?? "";
  const separatorLine = lines[start + 1] ?? "";
  if (!headerLine.includes("|") || !isTableSeparator(separatorLine)) return null;
  const rows: string[][] = [splitTableRow(headerLine)];
  let index = start + 2;
  while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim()) {
    rows.push(splitTableRow(lines[index] ?? ""));
    index += 1;
  }
  const width = Math.max(...rows.map((row) => row.length));
  const children: NotionBlock[] = rows.map((row) => ({
    object: "block",
    type: "table_row",
    table_row: {
      cells: Array.from({ length: width }, (_, cellIndex) => markdownToRichText(row[cellIndex] ?? ""))
    }
  }));
  return {
    block: {
      object: "block",
      type: "table",
      table: { table_width: width, has_column_header: true, has_row_header: false, children }
    },
    end: index
  };
}

export function markdownToBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: NotionBlock[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length) {
      blocks.push(richTextBlock("paragraph", paragraph.join("\n")));
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    const callout = parseCallout(lines, index);
    if (callout) {
      flush();
      blocks.push(callout.block);
      index = callout.end;
      continue;
    }
    const table = parseTable(lines, index);
    if (table) {
      flush();
      blocks.push(table.block);
      index = table.end;
      continue;
    }
    const fence = line.match(/^```([^\s]*)\s*$/);
    if (fence) {
      flush();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) code.push(lines[index++] ?? "");
      if (index < lines.length) index += 1;
      blocks.push(richTextBlock("code", code.join("\n"), { language: notionCodeLanguage(fence[1] ?? "") }));
      continue;
    }
    if (!line.trim()) {
      flush();
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push(richTextBlock(`heading_${heading[1]?.length}`, heading[2] ?? ""));
      index += 1;
      continue;
    }
    if (/^\s*(---|\*\s*\*\s*\*)\s*$/.test(line)) {
      flush();
      blocks.push({ object: "block", type: "divider", divider: {} });
      index += 1;
      continue;
    }
    const todo = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (todo) {
      flush();
      const todoText = (todo[2] ?? "").replace(/^#{1,3}\s+/, "");
      blocks.push(richTextBlock("to_do", todoText, { checked: todo[1]?.toLowerCase() === "x" }));
      index += 1;
      continue;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      flush();
      blocks.push(richTextBlock("bulleted_list_item", bullet[1] ?? ""));
      index += 1;
      continue;
    }
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (numbered) {
      flush();
      blocks.push(richTextBlock("numbered_list_item", numbered[1] ?? ""));
      index += 1;
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flush();
      blocks.push(richTextBlock("quote", quote[1] ?? ""));
      index += 1;
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flush();
  return blocks;
}

function blockData(block: NotionBlock): Record<string, unknown> {
  const value = block[block.type];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function blockText(block: NotionBlock): string {
  const value = blockData(block).rich_text;
  return richTextToMarkdown(Array.isArray(value) ? (value as RichText[]) : []);
}

export const SAFE_REPLACE_BLOCK_TYPES = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "quote",
  "code",
  "callout",
  "divider",
  "table",
  "table_row"
]);

function nestedChildren(block: NotionBlock): NotionBlock[] {
  if (block.children?.length) return block.children;
  const children = blockData(block).children;
  return Array.isArray(children) ? (children as NotionBlock[]) : [];
}

export function unsupportedBlocks(blocks: NotionBlock[]): string[] {
  return [
    ...new Set(
      blocks.flatMap((block) => {
        const nested = unsupportedBlocks(nestedChildren(block));
        return SAFE_REPLACE_BLOCK_TYPES.has(block.type) ? nested : [block.type, ...nested];
      })
    )
  ];
}

export function validateWritableBlocks(blocks: NotionBlock[]): void {
  const visit = (block: NotionBlock, depth: number): void => {
    if (depth > 2) throw new Error("Notion only accepts two nested block levels in one append request");
    if (!SAFE_REPLACE_BLOCK_TYPES.has(block.type))
      throw new Error(`Cannot write unsupported block type: ${block.type}`);
    const richText = blockData(block).rich_text;
    if (Array.isArray(richText)) {
      if (richText.length > 100)
        throw new Error(`A ${block.type} block contains more than 100 rich-text spans; split it into smaller blocks`);
      for (const item of richText as RichText[]) {
        if ((item.text?.content ?? "").length > 2000)
          throw new Error(`A ${block.type} rich-text span exceeds Notion's 2,000-character limit`);
      }
    }
    const cells = blockData(block).cells;
    if (Array.isArray(cells)) {
      for (const cell of cells) {
        if (!Array.isArray(cell)) throw new Error("A Notion table cell must contain a rich-text array");
        if (cell.length > 100) throw new Error("A Notion table cell contains more than 100 rich-text spans");
        for (const item of cell as RichText[]) {
          if ((item.text?.content ?? "").length > 2000)
            throw new Error("A Notion table cell rich-text span exceeds the 2,000-character limit");
        }
      }
    }
    nestedChildren(block).forEach((child) => visit(child, depth + 1));
  };
  blocks.forEach((block) => visit(block, 1));
}

export function blocksToMarkdown(blocks: NotionBlock[]): string {
  const output: string[] = [];
  for (const block of blocks) {
    const data = blockData(block);
    const text = blockText(block);
    switch (block.type) {
      case "paragraph":
        output.push(text);
        break;
      case "heading_1":
        output.push(`# ${text}`);
        break;
      case "heading_2":
        output.push(`## ${text}`);
        break;
      case "heading_3":
        output.push(`### ${text}`);
        break;
      case "bulleted_list_item":
        output.push(`- ${text}`);
        break;
      case "numbered_list_item":
        output.push(`1. ${text}`);
        break;
      case "to_do":
        output.push(`- [${data.checked ? "x" : " "}] ${text}`);
        break;
      case "quote":
        output.push(`> ${text}`);
        break;
      case "divider":
        output.push("---");
        break;
      case "code":
        output.push([`\`\`\`${String(data.language ?? "")}`, text, "```"].join("\n"));
        break;
      case "callout": {
        const icon = data.icon as { emoji?: string } | undefined;
        const richText = Array.isArray(data.rich_text) ? (data.rich_text as RichText[]) : [];
        const label = richText.map((item) => item.plain_text ?? item.text?.content ?? "").join("");
        const [labelType = "", customTitle] = label.split(" — ", 2);
        const labelledKind = labelType.toLowerCase();
        const kind = labelledKind in CALLOUT_EMOJI ? labelledKind : (EMOJI_CALLOUT[icon?.emoji ?? ""] ?? "note");
        const inferredTitle = labelledKind in CALLOUT_EMOJI ? customTitle : label;
        const header = `> [!${kind}]${inferredTitle ? ` ${inferredTitle}` : ""}`;
        const body = blocksToMarkdown(nestedChildren(block)).trimEnd();
        output.push(body ? [header, ...body.split("\n").map((line) => (line ? `> ${line}` : ">"))].join("\n") : header);
        break;
      }
      case "table": {
        const rows = nestedChildren(block)
          .filter((child) => child.type === "table_row")
          .map((child) => {
            const cells = blockData(child).cells;
            return Array.isArray(cells)
              ? cells.map((cell) =>
                  richTextToMarkdown(Array.isArray(cell) ? (cell as RichText[]) : []).replace(/\|/g, "\\|")
                )
              : [];
          });
        const width = Number(data.table_width) || Math.max(1, ...rows.map((row) => row.length));
        const hasHeader = data.has_column_header !== false;
        const header = hasHeader && rows.length ? (rows[0] ?? []) : Array.from({ length: width }, () => "");
        const bodyRows = hasHeader ? rows.slice(1) : rows;
        const renderRow = (row: string[]): string =>
          `| ${Array.from({ length: width }, (_, index) => row[index] ?? "").join(" | ")} |`;
        output.push(
          [renderRow(header), renderRow(Array.from({ length: width }, () => "---")), ...bodyRows.map(renderRow)].join(
            "\n"
          )
        );
        break;
      }
      case "table_row":
        break;
      default:
        output.push(`<!-- notion-sync: unsupported ${block.type} block omitted -->`);
    }
  }
  return output.join("\n\n").trimEnd() + (output.length ? "\n" : "");
}
