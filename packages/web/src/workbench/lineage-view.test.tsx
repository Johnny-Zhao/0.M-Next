import { describe, expect, it } from "vitest";

import type { LineageView as ApiLineageView, ViewObject } from "@m-next/views";

import {
  formatLineageExpression,
  formatLineageValue,
  lineageFieldLabel,
  lineageNodeText,
} from "./lineage-view";

describe("lineage view formatting", () => {
  it("renders area as a readable derived expression", () => {
    expect(formatLineageExpression("area_fx", areaView, room)).toBe(
      "面积(10.2 ㎡) = 长(3.4 m) × 宽(3 m)",
    );
  });

  it("renders chained window ratio with current upstream values", () => {
    expect(
      formatLineageExpression("window_floor_ratio_fx", ratioView, room),
    ).toBe("窗地比(0.118) = 窗面积(1.2 ㎡) ÷ 面积(10.2 ㎡)");
  });

  it("labels lineage nodes with Chinese names and current values", () => {
    expect(
      lineageNodeText(
        {
          kind: "derived",
          objectId: "room-1",
          objectType: "room",
          fieldCode: "area_fx",
          ref: null,
          source: null,
          updatedAt: null,
          depth: 1,
        },
        room,
      ),
    ).toBe("派生 · 面积 · 10.2 ㎡");
  });

  it("falls back without inventing values", () => {
    expect(lineageFieldLabel("unknown_fx")).toBe("字段");
    expect(formatLineageValue("unknown_fx", undefined)).toBe("未取到");
  });
});

const room: ViewObject = {
  objectId: "room-1",
  objectType: "room",
  status: "ACTIVE",
  version: 1,
  fields: {
    name: "暗次卧",
    length_m: 3.4,
    width_m: 3,
    window_area_m2: 1.2,
  },
  derived: {
    area_fx: 10.2,
    window_floor_ratio_fx: 0.117647,
  },
  updatedAt: "2026-06-21T00:00:00Z",
  source: "manual",
  ruleStatus: "BLOCK",
};

const areaView: ApiLineageView = {
  objectId: "room-1",
  fieldCode: "area_fx",
  algorithm: { kind: "derived", ref: "field('length_m') * field('width_m')" },
  upstream: [],
  downstream: [],
  partial: false,
  truncated: false,
};

const ratioView: ApiLineageView = {
  objectId: "room-1",
  fieldCode: "window_floor_ratio_fx",
  algorithm: {
    kind: "derived",
    ref: "field('window_area_m2') / field('area_fx')",
  },
  upstream: [],
  downstream: [],
  partial: false,
  truncated: false,
};
