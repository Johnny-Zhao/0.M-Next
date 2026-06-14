import { useEffect, useRef, useState, type ReactElement } from "react";

import type {
  MatrixCell,
  MatrixObject,
  MatrixResult,
  ViewClient,
} from "../api/view-client";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import type { SelectionRef } from "../selection/selection-ref";

const PAGE_SIZE = 50;
const emptyMatrix: MatrixResult = {
  rows: [],
  cols: [],
  cells: [],
  rowTotal: 0,
  colTotal: 0,
};

export interface MatrixViewProps {
  readonly viewClient: ViewClient;
  readonly selection: SelectionCoordinator;
  readonly workspaceId: string;
  readonly rowType: string;
  readonly colType: string;
  readonly relationType: string;
  readonly onError?: (title: string) => void;
}

export function selectMatrixRelation(
  selection: SelectionCoordinator,
  relationId: string,
): void {
  selection.select({ entityType: "relation", entityId: relationId });
}

export function selectMatrixObject(
  selection: SelectionCoordinator,
  objectId: string,
): void {
  selection.select({ entityType: "object", entityId: objectId });
}

export function matrixCellClass(
  cell: MatrixCell | undefined,
  selection: SelectionRef | null,
): string {
  return selection?.entityType === "relation" &&
    cell?.relationId === selection.entityId
    ? "matrix-cell-selected"
    : "";
}

export function matrixHeaderClass(
  objectId: string,
  selection: SelectionRef | null,
  selectedRelation: MatrixCell | undefined,
): string {
  const selectedObject =
    selection?.entityType === "object" && selection.entityId === objectId;
  const selectedEndpoint =
    selectedRelation?.rowId === objectId ||
    selectedRelation?.colId === objectId;
  return selectedObject || selectedEndpoint ? "matrix-header-selected" : "";
}

export function matrixAxisClass(
  objectId: string,
  selection: SelectionRef | null,
): string {
  return selection?.entityType === "object" && selection.entityId === objectId
    ? "matrix-axis-selected"
    : "";
}

export function MatrixView(props: MatrixViewProps): ReactElement {
  const {
    viewClient,
    selection,
    workspaceId,
    rowType,
    colType,
    relationType,
    onError,
  } = props;
  const [matrix, setMatrix] = useState<MatrixResult>(emptyMatrix);
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  const [rowPage, setRowPage] = useState(0);
  const [colPage, setColPage] = useState(0);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let active = true;
    void viewClient
      .matrix(
        workspaceId,
        rowType,
        colType,
        relationType,
        rowPage,
        PAGE_SIZE,
        colPage,
        PAGE_SIZE,
      )
      .then((result) => {
        if (active) setMatrix(result);
      })
      .catch((error: unknown) => {
        if (active) {
          onErrorRef.current?.(
            error instanceof Error ? error.message : "矩阵加载失败",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [
    colPage,
    colType,
    relationType,
    rowPage,
    rowType,
    viewClient,
    workspaceId,
  ]);

  useEffect(() => selection.subscribe(setSelected), [selection]);

  return (
    <section aria-label="矩阵视图">
      <MatrixGrid matrix={matrix} selected={selected} selection={selection} />
      <div className="matrix-pagination">
        <button
          disabled={rowPage === 0}
          onClick={() => setRowPage(rowPage - 1)}
          type="button"
        >
          上一行页
        </button>
        <button
          disabled={(rowPage + 1) * PAGE_SIZE >= matrix.rowTotal}
          onClick={() => setRowPage(rowPage + 1)}
          type="button"
        >
          下一行页
        </button>
        <button
          disabled={colPage === 0}
          onClick={() => setColPage(colPage - 1)}
          type="button"
        >
          上一列页
        </button>
        <button
          disabled={(colPage + 1) * PAGE_SIZE >= matrix.colTotal}
          onClick={() => setColPage(colPage + 1)}
          type="button"
        >
          下一列页
        </button>
      </div>
    </section>
  );
}

export function MatrixGrid(props: {
  readonly matrix: MatrixResult;
  readonly selected: SelectionRef | null;
  readonly selection: SelectionCoordinator;
}): ReactElement {
  const selectedRelation = props.matrix.cells.find(
    (cell) =>
      props.selected?.entityType === "relation" &&
      cell.relationId === props.selected.entityId,
  );
  const cells = new Map(
    props.matrix.cells.map((cell) => [`${cell.rowId}:${cell.colId}`, cell]),
  );
  return (
    <table className="matrix-grid">
      <thead>
        <tr>
          <th scope="col">行 / 列</th>
          {props.matrix.cols.map((col) => (
            <MatrixHeader
              key={col.objectId}
              object={col}
              selected={props.selected}
              selectedRelation={selectedRelation}
              selection={props.selection}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {props.matrix.rows.map((row) => (
          <MatrixRow
            cells={cells}
            cols={props.matrix.cols}
            key={row.objectId}
            row={row}
            selected={props.selected}
            selectedRelation={selectedRelation}
            selection={props.selection}
          />
        ))}
      </tbody>
    </table>
  );
}

function MatrixHeader(props: {
  readonly object: MatrixObject;
  readonly selected: SelectionRef | null;
  readonly selectedRelation: MatrixCell | undefined;
  readonly selection: SelectionCoordinator;
}): ReactElement {
  return (
    <th
      className={matrixHeaderClass(
        props.object.objectId,
        props.selected,
        props.selectedRelation,
      )}
      scope="col"
    >
      <button
        onClick={() =>
          selectMatrixObject(props.selection, props.object.objectId)
        }
        type="button"
      >
        {props.object.label}
      </button>
      <small>{props.object.status}</small>
    </th>
  );
}

function MatrixRow(props: {
  readonly row: MatrixObject;
  readonly cols: readonly MatrixObject[];
  readonly cells: ReadonlyMap<string, MatrixCell>;
  readonly selected: SelectionRef | null;
  readonly selectedRelation: MatrixCell | undefined;
  readonly selection: SelectionCoordinator;
}): ReactElement {
  return (
    <tr className={matrixAxisClass(props.row.objectId, props.selected)}>
      <th
        className={matrixHeaderClass(
          props.row.objectId,
          props.selected,
          props.selectedRelation,
        )}
        scope="row"
      >
        <button
          onClick={() =>
            selectMatrixObject(props.selection, props.row.objectId)
          }
          type="button"
        >
          {props.row.label}
        </button>
        <small>{props.row.status}</small>
      </th>
      {props.cols.map((col) => {
        const cell = props.cells.get(`${props.row.objectId}:${col.objectId}`);
        return (
          <td
            aria-current={
              matrixCellClass(cell, props.selected) !== "" || undefined
            }
            className={`${matrixCellClass(cell, props.selected)} ${matrixAxisClass(
              col.objectId,
              props.selected,
            )}`}
            key={col.objectId}
          >
            {cell ? (
              <button
                aria-label={`${props.row.label} 到 ${col.label} 的关系`}
                onClick={() =>
                  selectMatrixRelation(props.selection, cell.relationId)
                }
                type="button"
              >
                ● {cell.status}
              </button>
            ) : null}
          </td>
        );
      })}
    </tr>
  );
}
