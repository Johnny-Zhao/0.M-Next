import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { UsAvatar, UsMonoTag, UsStatusPill, pushToast } from "../primitives";
import { sessionStore, useSessionSnapshot } from "../state/session-store";
import { selectionStore } from "../state/selection-store";
import { workspaceStore, useWorkspaceSnapshot } from "../state/workspace-store";
import { moveMatrixCardColumn } from "./matrix-actions";
import { MatrixRecordCard } from "./record-card";
import { buildMatrixViewModel } from "./matrix-view-model";

export function MatrixBoard({ viewId }: { readonly viewId: string }) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const view = workspace.views.find(
    (candidate) => candidate.id === viewId && candidate.kind === "matrix",
  );
  const vm = useMemo(
    () => (view ? buildMatrixViewModel(workspace, view) : null),
    [workspace, view],
  );
  if (!view || !vm) return <p role="status">当前矩阵视图不可用。</p>;
  if (vm.state === "unavailable") return <p role="status">{vm.message}</p>;

  const canDrag =
    vm.allowColumnMove &&
    vm.colField.dataType === "enum" &&
    !vm.colField.computed &&
    !vm.colField.readOnly &&
    sessionStore.canDragCards(session.currentMemberId);
  const dropCard = (objectId: string, targetValue: string) => {
    const card = vm.cards.find((candidate) => candidate.objectId === objectId);
    if (!card) return;
    const result = moveMatrixCardColumn({
      session: sessionStore,
      resourceCode: vm.sourceTypeCode,
      objectId,
      fieldCode: vm.colField.code,
      fromValue: card.columnValue,
      toValue: targetValue,
    });
    if (result.kind === "noop") return;
    if (result.queued) {
      pushToast({ title: "已转审批", desc: "卡片将在审批通过后移动。" });
      return;
    }
    pushToast({
      title: `已移至「${targetValue}」`,
      actions: [
        {
          label: "撤销",
          tone: "gold",
          onPress: () => workspaceStore.undo(result.eventId),
        },
      ],
    });
  };

  return (
    <section className="us-matrix-shell">
      <header className="us-matrix-config">
        <span>
          数据:<b className="us-data">{vm.sourceLabel}</b>
        </span>
        <span>
          行:<b className="us-data">{vm.rowField.name}</b>
        </span>
        <span>
          列:<b className="us-data">{vm.colField.name}</b>
        </span>
        <span>
          卡片字段:<b className="us-data">{vm.cardFieldLabels.join(" · ")}</b>
        </span>
        <span>
          汇总:<b className="us-data">{vm.summaryLabel}</b>
        </span>
      </header>
      <div
        className="us-matrix-grid"
        style={{
          gridTemplateColumns: `150px repeat(${vm.columns.length}, minmax(160px, 1fr))`,
        }}
      >
        <span className="us-matrix-corner">
          {vm.rowField.name} × {vm.colField.name}
        </span>
        {vm.columns.map((column) => (
          <div
            className="us-matrix-colhead"
            data-dragover={dragOver === String(column.value)}
            key={String(column.value)}
            onDragLeave={() => setDragOver(null)}
            onDragOver={(event) => {
              if (!canDrag) return;
              event.preventDefault();
              setDragOver(String(column.value));
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(null);
              setDragging(null);
              dropCard(
                event.dataTransfer.getData("text/plain"),
                String(column.value),
              );
            }}
          >
            <UsStatusPill tone={column.tone}>{column.label}</UsStatusPill>
            <span className="us-data">{column.count}</span>
          </div>
        ))}
        {vm.state === "empty" ? <p role="status">{vm.message}</p> : null}
        {vm.rows.map((row) => (
          <MatrixRow
            canDrag={canDrag}
            columns={vm.columns}
            dragging={dragging}
            dropCard={dropCard}
            key={String(row.value)}
            onDragEnd={() => {
              setDragging(null);
              setDragOver(null);
            }}
            onDragOver={setDragOver}
            onOpen={(objectId) => {
              selectionStore.set({ entityType: "object", entityId: objectId });
              navigate(`/source/${vm.sourceTypeCode}?focus=${objectId}`);
            }}
            row={row}
            setDragging={setDragging}
            vm={vm}
          />
        ))}
      </div>
      <footer className="us-matrix-foot">
        <UsMonoTag active>LIVE</UsMonoTag>
        {vm.interactionHint}
      </footer>
    </section>
  );
}

function MatrixRow({
  canDrag,
  columns,
  dragging,
  dropCard,
  onDragEnd,
  onDragOver,
  onOpen,
  row,
  setDragging,
  vm,
}: {
  readonly canDrag: boolean;
  readonly columns: ReturnType<typeof buildMatrixViewModel>["columns"];
  readonly dragging: string | null;
  readonly dropCard: (objectId: string, targetValue: string) => void;
  readonly onDragEnd: () => void;
  readonly onDragOver: (columnValue: string | null) => void;
  readonly onOpen: (objectId: string) => void;
  readonly row: ReturnType<typeof buildMatrixViewModel>["rows"][number];
  readonly setDragging: (objectId: string) => void;
  readonly vm: ReturnType<typeof buildMatrixViewModel>;
}) {
  return (
    <>
      <div className="us-matrix-rowhead">
        <UsAvatar member={row.avatar} label={row.label.slice(0, 1)} />
        <strong>{row.label}</strong>
        <span className="us-data">{row.count} 项</span>
      </div>
      {columns.map((column) => {
        const cards = vm.cards.filter(
          (card) =>
            card.rowValue === row.value && card.columnValue === column.value,
        );
        return (
          <div
            className="us-matrix-cell"
            data-dim={column.dim}
            data-dragging={dragging !== null}
            key={`${String(row.value)}-${String(column.value)}`}
            onDragLeave={() => onDragOver(null)}
            onDragOver={(event) => {
              if (!canDrag) return;
              event.preventDefault();
              onDragOver(String(column.value));
            }}
            onDrop={(event) => {
              event.preventDefault();
              onDragEnd();
              dropCard(
                event.dataTransfer.getData("text/plain"),
                String(column.value),
              );
            }}
          >
            {cards.map((card) => (
              <MatrixRecordCard
                canDrag={canDrag}
                card={card}
                key={card.objectId}
                onClick={() => onOpen(card.objectId)}
                onDragStart={() => setDragging(card.objectId)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
