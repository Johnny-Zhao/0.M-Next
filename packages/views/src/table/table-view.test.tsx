import { describe, expect, it, vi } from "vitest";

import type { ObjectType } from "../api/view-client";
import {
  cellClassName,
  commitTableCellEdit,
  isTerminalStatus,
  ruleStatusMark,
  tableColumns,
} from "./table-view";

describe("TableView behavior", () => {
  it("derives columns from changing object type definitions", () => {
    const type = (fields: ObjectType["fields"]): ObjectType => ({
      id: "type",
      code: "demo_object",
      name: "Demo",
      fields,
    });
    const cost = {
      code: "cost",
      name: "成本",
      dataType: "number",
      required: false,
      constraints: {},
    };
    const owner = { ...cost, code: "owner", name: "负责人" };

    expect(tableColumns(type([cost])).map((field) => field.code)).toEqual([
      "cost",
    ]);
    expect(tableColumns(type([owner])).map((field) => field.code)).toEqual([
      "owner",
    ]);
  });

  it("treats terminal rows as read only", () => {
    expect(isTerminalStatus("CONFIRMED")).toBe(true);
    expect(isTerminalStatus("FILED")).toBe(true);
    expect(isTerminalStatus("DRAFT")).toBe(false);
  });

  it("outlines only the selected field cell", () => {
    const selection = {
      entityType: "field" as const,
      entityId: "object",
      fieldCode: "cost",
    };
    expect(cellClassName(selection, "object", "cost", false)).toContain(
      "selected-cell",
    );
    expect(cellClassName(selection, "object", "owner", false)).not.toContain(
      "selected-cell",
    );
  });

  it("maps rule status to compact visual marks", () => {
    expect(ruleStatusMark("OK")).toBe("✓");
    expect(ruleStatusMark("WARN")).toBe("!");
    expect(ruleStatusMark("BLOCK")).toBe("×");
    expect(ruleStatusMark("UNKNOWN")).toBe("?");
  });

  it("notifies the shell after a successful cell save", async () => {
    const updateFields = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const field = {
      code: "power_w",
      name: "功耗",
      dataType: "number",
      required: false,
      constraints: {},
    };
    const row = {
      objectId: "module-1",
      objectType: "module",
      status: "ACTIVE",
      version: 3,
      fields: { power_w: 180 },
      updatedAt: "2026-07-02T00:00:00Z",
      source: "manual",
      ruleStatus: "OK" as const,
    };

    const nextPage = await commitTableCellEdit({
      workspaceId: "workspace-1",
      commandClient: { updateFields },
      page: { items: [row], page: 0, pageSize: 50, total: 1 },
      row,
      cell: { objectId: row.objectId, field, value: "240" },
      onSaved,
    });

    expect(updateFields).toHaveBeenCalledWith("workspace-1", "module-1", 3, [
      {
        fieldDefCode: "power_w",
        value: "240",
        expectedFieldVersion: 3,
      },
    ]);
    expect(nextPage.items[0]?.fields.power_w).toBe("240");
    expect(nextPage.items[0]?.version).toBe(4);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
