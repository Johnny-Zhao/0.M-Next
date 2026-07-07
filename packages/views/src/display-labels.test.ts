import { describe, expect, it } from "vitest";

import {
  fieldLabel,
  objectDisplayTitle,
  objectTypeLabel,
} from "./display-labels";
import type { ViewObject } from "./api/view-client";

const baseObject: ViewObject = {
  objectId: "a0000000-0000-4000-8000-000000000000",
  objectType: "module",
  status: "ACTIVE",
  version: 1,
  fields: {},
  updatedAt: "2026-07-07T00:00:00Z",
  source: null,
  ruleStatus: "OK",
};

describe("display labels", () => {
  it("maps technical proposal object and field codes to Chinese labels", () => {
    expect(objectTypeLabel("proposal_node")).toBe("方案节点");
    expect(objectTypeLabel("alternative")).toBe("比选方案");
    expect(fieldLabel("power_w", "Power W")).toBe("功率(W)");
    expect(fieldLabel("responsibility", "Responsibility")).toBe("职责");
  });

  it("falls back to backend field names and readable object titles", () => {
    expect(fieldLabel("unknown_field", "后端字段")).toBe("后端字段");
    expect(objectDisplayTitle(baseObject)).toBe("模块 a00000");
    expect(
      objectDisplayTitle({ ...baseObject, fields: { name: "方案编排模块" } }),
    ).toBe("方案编排模块");
  });
});
