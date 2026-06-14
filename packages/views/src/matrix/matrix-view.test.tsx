import { describe, expect, it, vi } from "vitest";

import { type MatrixResult, ViewClient } from "../api/view-client";
import { SelectionCoordinator } from "../selection/selection-coordinator";
import {
  MatrixGrid,
  matrixAxisClass,
  matrixCellClass,
  matrixHeaderClass,
  selectMatrixObject,
  selectMatrixRelation,
} from "./matrix-view";

const matrix: MatrixResult = {
  rows: [{ objectId: "row", label: "需求 A", status: "DRAFT" }],
  cols: [{ objectId: "col", label: "功能 B", status: "CONFIRMED" }],
  cells: [
    {
      rowId: "row",
      colId: "col",
      relationId: "relation",
      status: "ACTIVE",
      fields: {},
    },
  ],
  rowTotal: 1,
  colTotal: 1,
};

describe("MatrixView", () => {
  it("renders row, column and matching relation cell", () => {
    const element = MatrixGrid({
      matrix,
      selected: { entityType: "relation", entityId: "relation" },
      selection: new SelectionCoordinator(),
    });
    const rendered = JSON.stringify(element);

    expect(rendered).toContain("需求 A");
    expect(rendered).toContain("功能 B");
    expect(rendered).toContain("ACTIVE");
  });

  it("selects a relation cell and highlights external relation selection", () => {
    const selection = new SelectionCoordinator();
    selectMatrixRelation(selection, "relation");

    expect(selection.current()).toEqual({
      entityType: "relation",
      entityId: "relation",
    });
    expect(matrixCellClass(matrix.cells[0], selection.current())).toBe(
      "matrix-cell-selected",
    );
    expect(matrixHeaderClass("row", selection.current(), matrix.cells[0])).toBe(
      "matrix-header-selected",
    );
    expect(matrixHeaderClass("col", selection.current(), matrix.cells[0])).toBe(
      "matrix-header-selected",
    );
  });

  it("selects row headers at object level", () => {
    const selection = new SelectionCoordinator();

    selectMatrixObject(selection, "row");

    expect(selection.current()).toEqual({
      entityType: "object",
      entityId: "row",
    });
    expect(matrixHeaderClass("row", selection.current(), undefined)).toBe(
      "matrix-header-selected",
    );
    expect(matrixAxisClass("row", selection.current())).toBe(
      "matrix-axis-selected",
    );
    expect(matrixAxisClass("col", selection.current())).toBe("");
  });

  it("uses a bounded matrix query without writes", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(matrix),
    });
    const client = new ViewClient("", fetchFn);

    await client.matrix(
      "workspace",
      "requirement",
      "function",
      "traces_to",
      1,
      25,
      2,
      30,
    );

    expect(fetchFn).toHaveBeenCalledWith(
      "/workspaces/workspace/views/matrix?rowType=requirement&colType=function&relationType=traces_to&rowPage=1&rowSize=25&colPage=2&colSize=30",
    );
    expect(() =>
      client.matrix("workspace", "requirement", "function", "traces_to", 0, 51),
    ).toThrow("sizes must be 1..50");
  });
});
