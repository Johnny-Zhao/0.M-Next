import { describe, expect, it } from "vitest";

import type { ObjectType } from "../api/view-client";
import {
  cellClassName,
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
});
