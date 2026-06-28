import { describe, expect, it, vi } from "vitest";

import { CommandFailure } from "../api/command-client";
import {
  type MatrixCell,
  type MatrixResult,
  ViewClient,
} from "../api/view-client";
import { SelectionCoordinator } from "../selection/selection-coordinator";
import {
  MatrixGrid,
  canEditMatrixCell,
  matrixAxisClass,
  matrixCellClass,
  matrixCellTone,
  matrixHeaderClass,
  saveMatrixCell,
  selectMatrixCell,
  selectMatrixObject,
  selectMatrixRelation,
  type MatrixCommandClient,
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
const editableRow = { objectId: "row", label: "需求 A", status: "DRAFT" };
const editableCol = { objectId: "col", label: "功能 B", status: "DRAFT" };

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

  it("selects matrix cells and returns the active row-column pair", () => {
    const selection = new SelectionCoordinator();

    const pair = selectMatrixCell(selection, "row", "col", "relation");

    expect(pair).toEqual({ rowId: "row", colId: "col" });
    expect(selection.current()).toEqual({
      entityType: "relation",
      entityId: "relation",
    });
    expect(matrixHeaderClass("col", selection.current(), undefined, pair)).toBe(
      "matrix-header-selected",
    );
  });

  it("maps matrix cell status to semantic tones", () => {
    expect(matrixCellTone(undefined)).toBe("matrix-cell-missing");
    expect(matrixCellTone(matrix.cells[0])).toBe("matrix-cell-covered");
    expect(matrixCellTone({ ...matrix.cells[0], status: "WARN" })).toBe(
      "matrix-cell-warn",
    );
    expect(matrixCellTone({ ...matrix.cells[0], status: "BLOCK" })).toBe(
      "matrix-cell-block",
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

  it("connects an empty editable cell through the command client", async () => {
    const commandClient = matrixCommandClient();

    const result = await saveMatrixCell({
      commandClient,
      workspaceId: "workspace",
      relationType: "depends_on",
      row: editableRow,
      col: editableCol,
    });

    expect(result.kind).toBe("saved");
    expect(commandClient.createRelation).toHaveBeenCalledWith(
      "workspace",
      "depends_on",
      "row",
      "col",
    );
    expect(commandClient.unlink).not.toHaveBeenCalled();
  });

  it("disconnects an existing editable relation with its expected version", async () => {
    const commandClient = matrixCommandClient();

    const result = await saveMatrixCell({
      commandClient,
      workspaceId: "workspace",
      relationType: "depends_on",
      row: editableRow,
      col: editableCol,
      cell: { ...matrix.cells[0], expectedVersion: 7 } as MatrixCell & {
        readonly expectedVersion: number;
      },
    });

    expect(result.kind).toBe("saved");
    expect(commandClient.unlink).toHaveBeenCalledWith(
      "workspace",
      "relation",
      7,
    );
    expect(commandClient.createRelation).not.toHaveBeenCalled();
  });

  it("returns a conflict result for KERNEL-409 command failures", async () => {
    const commandClient = matrixCommandClient({
      createRelation: vi.fn().mockRejectedValue(
        new CommandFailure({
          code: "KERNEL-409-VERSION-CONFLICT",
          title: "乐观版本冲突",
          details: { conflictingFields: [] },
        }),
      ),
    });

    const result = await saveMatrixCell({
      commandClient,
      workspaceId: "workspace",
      relationType: "depends_on",
      row: editableRow,
      col: editableCol,
    });

    expect(result.kind).toBe("conflict");
  });

  it("keeps terminal cells readonly even when a command client is injected", () => {
    const commandClient = matrixCommandClient();

    expect(
      canEditMatrixCell(
        { ...editableRow, status: "FILED" },
        editableCol,
        commandClient,
      ),
    ).toBe(false);
    expect(
      JSON.stringify(
        MatrixGrid({
          commandClient,
          matrix,
          selected: null,
          selection: new SelectionCoordinator(),
        }),
      ),
    ).not.toContain("断开");
  });

  it("keeps matrix cells readonly without an injected command client", () => {
    expect(canEditMatrixCell(editableRow, editableCol)).toBe(false);
    expect(
      JSON.stringify(
        MatrixGrid({
          matrix: { ...matrix, cols: [editableCol] },
          selected: null,
          selection: new SelectionCoordinator(),
        }),
      ),
    ).not.toContain("空格提交");
  });
});

function matrixCommandClient(
  overrides: Partial<MatrixCommandClient> = {},
): MatrixCommandClient &
  Readonly<Record<keyof MatrixCommandClient, ReturnType<typeof vi.fn>>> {
  return {
    createRelation: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as MatrixCommandClient &
    Readonly<Record<keyof MatrixCommandClient, ReturnType<typeof vi.fn>>>;
}
