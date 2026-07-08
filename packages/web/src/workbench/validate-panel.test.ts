import { describe, expect, it, vi } from "vitest";

import {
  collectRuleStatusSummary,
  ruleStatusLabel,
  runValidation,
  severityLabel,
  severityTone,
  shouldRunInitialValidation,
  summarizeRuleStatus,
} from "./validate-panel";

describe("validate-panel", () => {
  it("maps severities to tones (default info)", () => {
    expect(severityTone("BLOCK")).toBe("block");
    expect(severityTone("warn")).toBe("warn");
    expect(severityTone("INFO")).toBe("info");
    expect(severityTone("whatever")).toBe("info");
  });

  it("labels severities in Chinese without exposing unknown codes", () => {
    expect(severityLabel("BLOCK")).toBe("阻断");
    expect(severityLabel("WARN")).toBe("告警");
    expect(severityLabel("INFO")).toBe("提示");
    expect(severityLabel("X")).toBe("未知");
  });

  it("runs initial validation once per opened workspace", () => {
    expect(shouldRunInitialValidation(null, "ws-1")).toBe(true);
    expect(shouldRunInitialValidation("ws-1", "ws-1")).toBe(false);
    expect(shouldRunInitialValidation("ws-1", "ws-2")).toBe(true);
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

  it("runs a workspace-wide (null-scope) check so proposal BLOCK rules are evaluated", async () => {
    const runRuleCheck = vi.fn().mockResolvedValue("run-9");
    const checkResults = vi.fn().mockResolvedValue({
      items: [
        {
          runId: "run-9",
          ruleCode: "R-TD-PWR",
          severity: "BLOCK",
          message: "模块功耗总和超过方案预算",
          objectId: "proposal-1",
          fieldCode: null,
          configHash: "h",
          createdAt: "t",
        },
      ],
      page: 0,
      pageSize: 50,
      total: 1,
    });

    const results = await runValidation({
      viewClient: { runRuleCheck, checkResults },
      workspaceId: "ws",
      actorId: "actor",
    });

    // 关键:范围为 null(全工作空间),而非当前 objectType——否则 proposal 级 R-TD-PWR 被漏。
    expect(runRuleCheck).toHaveBeenCalledWith("ws", "actor", null);
    expect(checkResults).toHaveBeenCalledWith("ws", "run-9");
    expect(results.map((item) => item.ruleCode)).toEqual(["R-TD-PWR"]);
  });

  it("aggregates rule lamps across all object types (proposal BLOCK + modules)", async () => {
    const objectTypes = vi.fn().mockResolvedValue([
      { id: "t1", code: "proposal", name: "方案", fields: [] },
      { id: "t2", code: "module", name: "模块", fields: [] },
    ]);
    const objects = vi
      .fn()
      .mockResolvedValueOnce({
        items: [object("超预算方案", "BLOCK")],
        page: 0,
        pageSize: 200,
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [object("模块A", "WARN"), object("模块B", "OK")],
        page: 0,
        pageSize: 200,
        total: 2,
      });

    const summary = await collectRuleStatusSummary({
      viewClient: { objectTypes, objects },
      workspaceId: "ws",
    });

    // proposal 的 BLOCK 必须计入红灯(此前只按当前 objectType=module 统计会漏)。
    expect(objects).toHaveBeenCalledWith("ws", "proposal", 0, 200);
    expect(summary).toMatchObject({ block: 1, warn: 1, ok: 1 });
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
