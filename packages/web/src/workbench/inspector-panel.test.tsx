import type { ViewObject } from "@m-next/views";
import { describe, expect, it, vi } from "vitest";

import {
  handleInspectorFieldSaved,
  partitionFields,
  relationEndpointsLabel,
  relativeTime,
  saveInspectorField,
  sourceLabel,
} from "./inspector-panel";
import { runSaveAutoCheck } from "./save-auto-check";

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

describe("saveInspectorField", () => {
  const object: ViewObject = {
    objectId: "module-1",
    objectType: "module",
    status: "ACTIVE",
    version: 5,
    fields: { power_w: 180 },
    updatedAt: "2026-07-02T00:00:00Z",
    source: "manual",
    ruleStatus: "OK",
  };

  it("converts a numeric field to a number before sending", async () => {
    const updateFields = vi.fn().mockResolvedValue(undefined);

    const result = await saveInspectorField(
      { updateFields },
      "workspace-1",
      object,
      "power_w",
      "240",
      "number",
    );

    expect(result).toEqual({ kind: "saved", value: 240 });
    expect(updateFields).toHaveBeenCalledWith("workspace-1", "module-1", 5, [
      { fieldDefCode: "power_w", value: 240 },
    ]);
  });

  it("blocks a non-numeric input and does not send the command", async () => {
    const updateFields = vi.fn();

    const result = await saveInspectorField(
      { updateFields },
      "workspace-1",
      object,
      "power_w",
      "not-a-number",
      "number",
    );

    expect(result).toEqual({ kind: "invalid", message: "请输入数字" });
    expect(updateFields).not.toHaveBeenCalled();
  });
});

describe("Inspector field save", () => {
  it("keeps the saved notice when automatic rule check fails", async () => {
    const runRuleCheck = vi.fn().mockRejectedValue(new Error("rules offline"));
    const setMessage = vi.fn();
    const toastSuccess = vi.fn();
    const refreshSelected = vi.fn();
    const scheduleRefresh = vi.fn();
    const refreshViews = vi.fn();

    await handleInspectorFieldSaved("power_w", {
      setMessage,
      toastSuccess,
      refreshSelected,
      scheduleRefresh,
      autoCheckAfterSave: () =>
        runSaveAutoCheck({
          actorId: "actor-1",
          workspaceId: "workspace-1",
          viewClient: { runRuleCheck },
          refreshViews,
        }),
    });

    expect(setMessage).toHaveBeenCalledWith("power_w 已保存");
    expect(toastSuccess).toHaveBeenCalledWith("power_w 已保存");
    expect(refreshSelected).toHaveBeenCalledTimes(1);
    expect(scheduleRefresh).toHaveBeenCalledWith(refreshSelected, 800);
    expect(runRuleCheck).toHaveBeenCalledWith("workspace-1", "actor-1", null);
    expect(refreshViews).not.toHaveBeenCalled();
  });
});
