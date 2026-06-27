import { describe, expect, it } from "vitest";

import {
  ruleStatusLabel,
  severityLabel,
  severityTone,
  summarizeRuleStatus,
} from "./validate-panel";

describe("validate-panel", () => {
  it("maps severities to tones (default info)", () => {
    expect(severityTone("BLOCK")).toBe("block");
    expect(severityTone("warn")).toBe("warn");
    expect(severityTone("INFO")).toBe("info");
    expect(severityTone("whatever")).toBe("info");
  });

  it("labels severities in Chinese, passing through unknowns", () => {
    expect(severityLabel("BLOCK")).toBe("阻断");
    expect(severityLabel("WARN")).toBe("告警");
    expect(severityLabel("INFO")).toBe("提示");
    expect(severityLabel("X")).toBe("X");
  });

  it("summarizes object rule lamps for the initial panel state", () => {
    const summary = summarizeRuleStatus([
      object("客厅", "OK"),
      object("主卧", "WARN"),
      object("暗次卧", "BLOCK"),
      object("储藏", "UNKNOWN"),
    ]);

    expect(summary).toMatchObject({
      ok: 1,
      warn: 1,
      block: 1,
      unknown: 1,
    });
    expect(summary.hits.map((item) => item.ruleStatus)).toEqual([
      "WARN",
      "BLOCK",
      "UNKNOWN",
    ]);
    expect(ruleStatusLabel("BLOCK")).toBe("阻断");
  });
});

function object(name: string, ruleStatus: "BLOCK" | "WARN" | "OK" | "UNKNOWN") {
  return {
    objectId: name,
    objectType: "room",
    status: "ACTIVE",
    version: 1,
    fields: { name },
    updatedAt: "2026-06-21T00:00:00Z",
    source: null,
    ruleStatus,
  };
}
