import { describe, expect, it } from "vitest";

import type { TemplateCatalogItem } from "@m-next/views";

import {
  filterCapabilities,
  hiddenTypeCount,
  isPublished,
  publishedLabel,
  versionLabel,
  visibleTypeOverview,
} from "./capability-catalog";

const templates: readonly TemplateCatalogItem[] = [
  {
    templateId: "tpl-interior",
    code: "interior_design",
    name: "室内设计",
    version: 3,
    latestPublishedVersion: 2,
    publishedAt: "2026-06-28T00:00:00Z",
    description: "空间与构件建模",
    typeOverview: [
      { code: "room", name: "房间" },
      { code: "wall", name: "墙体" },
    ],
    typeOverviewTruncated: false,
  },
  {
    templateId: "tpl-draft",
    code: "draft",
    name: "草稿模板",
    version: 1,
    latestPublishedVersion: 0,
    publishedAt: null,
    description: null,
    typeOverview: [],
    typeOverviewTruncated: true,
  },
];

describe("capability catalog helpers", () => {
  it("filters capabilities by name or code on the client", () => {
    expect(filterCapabilities(templates, "室内")).toEqual([templates[0]]);
    expect(filterCapabilities(templates, "INTERIOR")).toEqual([templates[0]]);
    expect(filterCapabilities(templates, "missing")).toHaveLength(0);
  });

  it("marks unpublished templates and formats labels", () => {
    expect(isPublished(templates[0]!)).toBe(true);
    expect(versionLabel(templates[0]!)).toBe("v2");
    expect(publishedLabel(templates[0]!)).toContain("2026");
    expect(isPublished(templates[1]!)).toBe(false);
    expect(versionLabel(templates[1]!)).toBe("未发布");
    expect(publishedLabel(templates[1]!)).toBe("未发布");
  });

  it("shows object type chips with a conservative truncated count", () => {
    const manyTypes = {
      ...templates[0]!,
      typeOverview: [
        { code: "a", name: "A" },
        { code: "b", name: "B" },
        { code: "c", name: "C" },
        { code: "d", name: "D" },
        { code: "e", name: "E" },
      ],
      typeOverviewTruncated: false,
    };

    expect(visibleTypeOverview(manyTypes.typeOverview)).toHaveLength(4);
    expect(hiddenTypeCount(manyTypes)).toBe(1);
    expect(hiddenTypeCount(templates[1]!)).toBe(1);
  });
});
