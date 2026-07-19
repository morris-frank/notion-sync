import { describe, expect, it } from "vitest";
import { frontmatterFromPage, propertiesForPush, toNotionProperty } from "../src/property-mapper";
import { DEFAULT_SETTINGS, type NotionPage, type NotionPropertySchema } from "../src/types";

const schemas: Record<string, NotionPropertySchema> = {
  Name: { id: "title", name: "Name", type: "title" },
  Tags: { id: "tags", name: "Tags", type: "multi_select" },
  Status: { id: "status", name: "Status", type: "status" },
  Date: { id: "date", name: "Date", type: "date" }
};

const settings = {
  ...DEFAULT_SETTINGS,
  frontmatterKeys: ["tags", "status", "date", "private"],
  propertyMap: { tags: "Tags", status: "Status", date: "Date" }
};

describe("schema-aware property mapping", () => {
  it("only pushes allowed keys that exist in the data source schema", () => {
    expect(
      propertiesForPush(
        "Field note",
        {
          tags: ["soil", "trial"],
          status: "Draft",
          date: "2026-07-19"
        },
        schemas,
        settings
      )
    ).toMatchObject({
      Name: { title: expect.any(Array) },
      Tags: { multi_select: [{ name: "soil" }, { name: "trial" }] },
      Status: { status: { name: "Draft" } },
      Date: { date: { start: "2026-07-19" } }
    });
  });

  it("pulls mapped values back to their Obsidian keys", () => {
    const page = {
      id: "page",
      last_edited_time: "2026-07-19T10:00:00Z",
      properties: {
        Tags: { type: "multi_select", multi_select: [{ name: "soil" }] },
        Status: { type: "status", status: { name: "Ready" } },
        Date: { type: "date", date: { start: "2026-07-19" } }
      }
    } as NotionPage;
    expect(frontmatterFromPage(page, settings)).toEqual({ tags: ["soil"], status: "Ready", date: "2026-07-19" });
  });

  it("does not invent mappings for unsupported property types", () => {
    expect(toNotionProperty("x", { id: "person", name: "Owner", type: "people" })).toBeNull();
  });

  it("clears a mapped Notion property when the local key is removed", () => {
    expect(propertiesForPush("Field note", {}, schemas, settings)).toMatchObject({
      Tags: { multi_select: [] },
      Status: { status: null },
      Date: { date: null }
    });
  });

  it("matches common Notion property capitalization without an explicit map", () => {
    const withoutMap = { ...settings, propertyMap: {} };
    expect(propertiesForPush("Field note", { tags: ["soil"], date: "2026-07-19" }, schemas, withoutMap)).toMatchObject({
      Tags: { multi_select: [{ name: "soil" }] },
      Date: { date: { start: "2026-07-19" } }
    });
  });

  it("reports a configured property that cannot be synchronized", () => {
    expect(() =>
      propertiesForPush("Field note", { owner: "Maurice" }, schemas, {
        ...settings,
        frontmatterKeys: ["owner"],
        propertyMap: {}
      })
    ).toThrow("has no matching Notion property");
  });
});
