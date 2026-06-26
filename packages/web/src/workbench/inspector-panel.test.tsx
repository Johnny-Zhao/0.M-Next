import { describe, expect, it } from "vitest";

import {
  lineageNodeLabel,
  partitionFields,
  relationEndpointsLabel,
  relativeTime,
  sourceLabel,
} from "./inspector-panel";

describe("relativeTime", () => {
  const now = Date.parse("2026-06-21T12:00:00Z");

  it("formats sub-minute as 刚刚", () => {
    expect(relativeTime("2026-06-21T11:59:30Z", now)).toBe("刚刚");
  });

  it("formats minutes / hours / days", () => {
    expect(relativeTime("2026-06-21T11:30:00Z", now)).toBe("30 分钟前");
    expect(relativeTime("2026-06-21T09:00:00Z", now)).toBe("3 小时前");
    expect(relativeTime("2026-06-19T12:00:00Z", now)).toBe("2 天前");
  });

  it("returns — for unparseable input", () => {
    expect(relativeTime("not-a-date", now)).toBe("—");
  });

  it("never goes negative for future timestamps", () => {
    expect(relativeTime("2026-06-21T12:05:00Z", now)).toBe("刚刚");
  });
});

describe("partitionFields", () => {
  it("splits fields into derived and stored by predicate", () => {
    const result = partitionFields(
      { energyMargin: -4.2, capacity: 80, name: "BAT" },
      (code) => code === "energyMargin",
    );
    expect(result.derived).toEqual([["energyMargin", -4.2]]);
    expect(result.stored).toEqual([
      ["capacity", 80],
      ["name", "BAT"],
    ]);
  });

  it("handles empty fields", () => {
    const result = partitionFields({}, () => true);
    expect(result.derived).toEqual([]);
    expect(result.stored).toEqual([]);
  });
});

describe("sourceLabel", () => {
  it("maps known source kinds to Chinese", () => {
    expect(sourceLabel("manual")).toBe("手填");
    expect(sourceLabel("import")).toBe("导入");
    expect(sourceLabel("artifact_sync")).toBe("工具同步");
  });

  it("falls back to 未知 for null and passes through unknowns", () => {
    expect(sourceLabel(null)).toBe("未知");
    expect(sourceLabel("custom_kind")).toBe("custom_kind");
  });
});

describe("relationEndpointsLabel", () => {
  it("formats source → target", () => {
    expect(
      relationEndpointsLabel({
        relationId: "r1",
        relationType: "depends_on",
        sourceId: "a",
        targetId: "b",
        version: 1,
      }),
    ).toBe("a → b");
  });
});

describe("lineageNodeLabel", () => {
  it("labels a derived field node", () => {
    expect(
      lineageNodeLabel({
        kind: "derived",
        objectId: "o1",
        objectType: "room",
        fieldCode: "area_fx",
        ref: null,
        source: null,
        updatedAt: null,
        depth: 1,
      }),
    ).toBe("派生 · area_fx");
  });

  it("labels a rule node by ref when no field", () => {
    expect(
      lineageNodeLabel({
        kind: "rule",
        objectId: null,
        objectType: null,
        fieldCode: null,
        ref: "R-LIGHT-01",
        source: null,
        updatedAt: null,
        depth: 2,
      }),
    ).toBe("规则 · R-LIGHT-01");
  });
});
