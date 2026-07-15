import { useMemo } from "react";

import { UsButton, UsStatusPill } from "../primitives";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { buildCanvasViewModel } from "./canvas-view-model";

export function CanvasPropsPanel({
  viewId,
  canEdit,
  onRemove,
  onDelete,
}: {
  viewId: string;
  canEdit: boolean;
  onRemove: (objectIds: readonly string[]) => void;
  onDelete: (objectId: string) => void;
}) {
  const workspace = useWorkspaceSnapshot();
  const selection = useSelectionSnapshot();
  const view = workspace.views.find(
    (candidate) => candidate.id === viewId && candidate.kind === "canvas",
  );
  const selectedKey = selection.selected
    .filter((item) => item.entityType === "object")
    .map((item) => item.entityId)
    .join("|");
  const selectedIds = useMemo(
    () => new Set(selectedKey ? selectedKey.split("|") : []),
    [selectedKey],
  );
  const nodes = useMemo(
    () =>
      view
        ? buildCanvasViewModel(workspace, view).nodes.filter((node) =>
            selectedIds.has(node.objectId),
          )
        : [],
    [workspace, view, selectedIds],
  );

  if (nodes.length === 0) {
    return (
      <div className="us-canvas-inspector us-canvas-inspector--empty">
        <span className="us-data">0 selected</span>
        <p>在画布中选择一个或多个卡片，可查看字段、移除出视图或删除记录。</p>
      </div>
    );
  }

  return (
    <div className="us-canvas-inspector">
      <div className="us-canvas-inspector__head">
        <span className="us-data">已选 {nodes.length}</span>
        <UsButton
          size="sm"
          variant="ghost"
          onClick={() => selectionStore.clear()}
        >
          清空
        </UsButton>
      </div>
      <div className="us-canvas-inspector__list">
        {nodes.map((node) => (
          <article className="us-canvas-inspector-card" key={node.objectId}>
            <div>
              <span className="us-data">{node.indexLabel}</span>
              <h3>{node.name}</h3>
              <p>{node.sourceLabel}</p>
            </div>
            <UsStatusPill tone={statusTone(node.status)}>
              {node.status}
            </UsStatusPill>
            <dl>
              {node.fields.map((field) => (
                <div key={field.code}>
                  <dt>{field.label}</dt>
                  <dd className="us-data">{field.text}</dd>
                </div>
              ))}
            </dl>
            <footer>
              <UsButton
                size="sm"
                disabled={!canEdit}
                onClick={() => onRemove([node.objectId])}
              >
                从视图移除
              </UsButton>
              <UsButton
                size="sm"
                variant="danger"
                disabled={!canEdit}
                onClick={() => onDelete(node.objectId)}
              >
                删除记录
              </UsButton>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}

function statusTone(status: string): "sale" | "presale" | "dev" | "eol" {
  if (status === "presale" || status === "dev" || status === "eol") {
    return status;
  }
  return "sale";
}
