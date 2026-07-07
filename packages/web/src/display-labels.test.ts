import { describe, expect, it } from "vitest";

import {
  fieldLabel,
  objectDisplayTitle,
  objectTypeLabel,
  safeVisibleText,
  statusLabel,
  templateLabel,
} from "./display-labels";
import type { ViewObject } from "@m-next/views";

describe("display labels", () => {
  it("shows known templates and statuses as Chinese labels", () => {
    expect(templateLabel("technical_proposal")).toBe("技术方案");
    expect(objectTypeLabel("proposal")).toBe("方案");
    expect(objectTypeLabel("alternative")).toBe("比选方案");
    expect(fieldLabel("total_power_fx", "Total Power")).toBe("总功耗(W)");
    expect(statusLabel("ACTIVE")).toBe("正常");
  });

  it("hides internal codes and UUIDs from visible fallback text", () => {
    expect(safeVisibleText("technical_proposal", "技术方案")).toBe("技术方案");
    expect(
      safeVisibleText("a0000000-0000-4000-8000-000000000000", "对象"),
    ).toBe("对象");
  });

  it("formats object titles without exposing raw UUIDs", () => {
    const object: ViewObject = {
      objectId: "a0000000-0000-4000-8000-000000000000",
      objectType: "requirement",
      status: "ACTIVE",
      version: 1,
      fields: {},
      updatedAt: "2026-07-07T00:00:00Z",
      source: null,
      ruleStatus: "OK",
    };
    expect(objectDisplayTitle(object)).toBe("需求 a00000");
  });
});
