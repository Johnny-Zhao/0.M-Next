import { describe, expect, it } from "vitest";

import { partitionFields, relativeTime } from "./inspector-panel";

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
