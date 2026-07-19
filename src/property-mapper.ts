import type { NotionPage, NotionPropertySchema, NotionPropertyValue, NotionSyncSettings, RichText } from "./types";
import { markdownToRichText, richTextToMarkdown } from "./markdown-mapper";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function resolveSchema(
  schemas: Record<string, NotionPropertySchema>,
  requestedName: string
): [string, NotionPropertySchema] | undefined {
  const exact = schemas[requestedName];
  if (exact) return [requestedName, exact];
  const normalized = requestedName.toLocaleLowerCase();
  const matches = Object.entries(schemas).filter(
    ([name, schema]) => name.toLocaleLowerCase() === normalized || schema.name?.toLocaleLowerCase() === normalized
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function toNotionProperty(value: unknown, schema: NotionPropertySchema): NotionPropertyValue | null {
  switch (schema.type) {
    case "title":
      return { title: markdownToRichText(asText(value)) };
    case "rich_text":
      return { rich_text: markdownToRichText(asText(value)) };
    case "number": {
      const parsed = typeof value === "number" ? value : Number(value);
      return { number: Number.isFinite(parsed) ? parsed : null };
    }
    case "checkbox":
      return { checkbox: Boolean(value) };
    case "select":
      return { select: value == null || value === "" ? null : { name: asText(value) } };
    case "status":
      return { status: value == null || value === "" ? null : { name: asText(value) } };
    case "multi_select":
      return {
        multi_select: asArray(value)
          .map((item) => ({ name: asText(item) }))
          .filter((item) => item.name)
      };
    case "date":
      return { date: value == null || value === "" ? null : { start: asText(value) } };
    case "url":
      return { url: value == null || value === "" ? null : asText(value) };
    case "email":
      return { email: value == null || value === "" ? null : asText(value) };
    case "phone_number":
      return { phone_number: value == null || value === "" ? null : asText(value) };
    default:
      return null;
  }
}

export function fromNotionProperty(property: NotionPropertyValue): unknown {
  const type = property.type;
  switch (type) {
    case "title":
      return richTextToMarkdown((property.title as RichText[]) ?? []);
    case "rich_text":
      return richTextToMarkdown((property.rich_text as RichText[]) ?? []);
    case "number":
      return property.number ?? null;
    case "checkbox":
      return Boolean(property.checkbox);
    case "select":
      return (property.select as { name?: string } | null)?.name ?? null;
    case "status":
      return (property.status as { name?: string } | null)?.name ?? null;
    case "multi_select":
      return ((property.multi_select as { name: string }[]) ?? []).map((item) => item.name);
    case "date":
      return (property.date as { start?: string } | null)?.start ?? null;
    case "url":
      return property.url ?? null;
    case "email":
      return property.email ?? null;
    case "phone_number":
      return property.phone_number ?? null;
    default:
      return undefined;
  }
}

export function propertiesForPush(
  title: string,
  frontmatter: Record<string, unknown>,
  schemas: Record<string, NotionPropertySchema>,
  settings: NotionSyncSettings
): Record<string, NotionPropertyValue> {
  const output: Record<string, NotionPropertyValue> = {};
  const resolvedTitle = resolveSchema(schemas, settings.titleProperty);
  const titleSchema = resolvedTitle?.[1];
  if (!titleSchema || titleSchema.type !== "title")
    throw new Error(`Notion title property '${settings.titleProperty}' was not found`);
  output[resolvedTitle[0]] = { title: markdownToRichText(title) };
  for (const key of settings.frontmatterKeys) {
    const notionName = settings.propertyMap[key] ?? key;
    const resolved = resolveSchema(schemas, notionName);
    if (!resolved) {
      if (key in frontmatter)
        throw new Error(
          `Allowed frontmatter key '${key}' has no matching Notion property; create '${notionName}' or add a property-name mapping`
        );
      continue;
    }
    const [actualName, schema] = resolved;
    if (schema.type === "title") continue;
    const mapped = toNotionProperty(frontmatter[key], schema);
    if (!mapped) {
      if (key in frontmatter)
        throw new Error(`Notion property '${actualName}' has unsupported type '${schema.type}' for frontmatter sync`);
      continue;
    }
    output[actualName] = mapped;
  }
  return output;
}

export function frontmatterFromPage(page: NotionPage, settings: NotionSyncSettings): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of settings.frontmatterKeys) {
    const notionName = settings.propertyMap[key] ?? key;
    if (notionName.toLocaleLowerCase() === settings.titleProperty.toLocaleLowerCase()) continue;
    const actualName = Object.keys(page.properties).find(
      (name) => name.toLocaleLowerCase() === notionName.toLocaleLowerCase()
    );
    const property = actualName ? page.properties[actualName] : undefined;
    if (!property) continue;
    const value = fromNotionProperty(property);
    if (value !== undefined) output[key] = value;
  }
  return output;
}
