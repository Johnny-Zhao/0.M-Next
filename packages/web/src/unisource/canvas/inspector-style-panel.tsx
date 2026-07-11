import { useMemo } from "react";

import type { CanvasNodeConfig } from "../model/view-layer";
import { useSelectionSnapshot } from "../state/selection-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import {
  buildCanvasViewModel,
  deriveMixedValue,
  parseCanvasConfig,
} from "./canvas-view-model";

const fillOptions = ["paper", "primary", "change", "danger"] as const;

export function CanvasStylePanel({
  exprId,
  canEdit,
  onPatchNodes,
}: {
  exprId: string;
  canEdit: boolean;
  onPatchNodes: (
    objectIds: readonly string[],
    patch: (node: CanvasNodeConfig) => CanvasNodeConfig,
    summary: string,
  ) => void;
}) {
  const workspace = useWorkspaceSnapshot();
  const selection = useSelectionSnapshot();
  const view = workspace.views.find(
    (candidate) => candidate.exprId === exprId && candidate.kind === "canvas",
  );
  const selectedIds = useMemo(
    () =>
      selection.selected
        .filter((item) => item.entityType === "object")
        .map((item) => item.entityId),
    [selection.selected],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedKey = selectedIds.join("|");
  const selectedConfigIds = selectedKey
    ? selectedKey.split("|")
    : ([] as string[]);
  const nodes = useMemo(
    () =>
      view
        ? buildCanvasViewModel(workspace, view).nodes.filter((node) =>
            selectedIdSet.has(node.objectId),
          )
        : [],
    [workspace, view, selectedIdSet],
  );
  const configs = view
    ? parseCanvasConfig(view).nodes.filter((node) =>
        selectedConfigIds.includes(node.objectId),
      )
    : [];
  const fontSize = deriveMixedValue(nodes.map((node) => node.style.fontSize));
  const radius = deriveMixedValue(nodes.map((node) => node.style.radius));
  const fieldRows = deriveMixedValue(
    nodes.map((node) => node.visibility.fieldRows),
  );
  const docBadge = deriveMixedValue(
    nodes.map((node) => node.visibility.docBadge),
  );
  const edgeLabels = deriveMixedValue(
    nodes.map((node) => node.visibility.edgeLabels),
  );

  if (nodes.length === 0) {
    return (
      <div className="us-canvas-inspector us-canvas-inspector--empty">
        <span className="us-data">STYLE</span>
        <p>选择卡片后，可批量调整填充、字号、圆角和可见信息。</p>
      </div>
    );
  }

  const patchSelected = (
    patch: (node: CanvasNodeConfig) => CanvasNodeConfig,
    summary: string,
  ) => onPatchNodes(selectedIds, patch, summary);

  return (
    <div className="us-canvas-inspector">
      <section className="us-canvas-style-section">
        <h3>填充</h3>
        <div className="us-canvas-swatches">
          {fillOptions.map((fill) => (
            <button
              key={fill}
              type="button"
              data-fill={fill}
              disabled={!canEdit}
              onClick={() =>
                patchSelected(
                  (node) => ({
                    ...node,
                    style: { ...node.style, fill },
                  }),
                  `调整 ${configs.length} 个卡片填充`,
                )
              }
            >
              {fill}
            </button>
          ))}
        </div>
      </section>
      <section className="us-canvas-style-section">
        <h3>版式</h3>
        <label>
          字号 <span className="us-data">{formatMixed(fontSize)}</span>
          <input
            type="range"
            min="11"
            max="18"
            disabled={!canEdit}
            value={typeof fontSize === "number" ? fontSize : 13}
            onChange={(event) =>
              patchSelected(
                (node) => ({
                  ...node,
                  style: {
                    ...node.style,
                    fontSize: Number(event.target.value),
                  },
                }),
                "调整卡片字号",
              )
            }
          />
        </label>
        <label>
          圆角 <span className="us-data">{formatMixed(radius)}</span>
          <input
            type="range"
            min="4"
            max="20"
            disabled={!canEdit}
            value={typeof radius === "number" ? radius : 12}
            onChange={(event) =>
              patchSelected(
                (node) => ({
                  ...node,
                  style: { ...node.style, radius: Number(event.target.value) },
                }),
                "调整卡片圆角",
              )
            }
          />
        </label>
      </section>
      <section className="us-canvas-style-section">
        <h3>显示</h3>
        <VisibilityToggle
          label="字段行"
          mixedValue={fieldRows}
          disabled={!canEdit}
          onToggle={(next) =>
            patchSelected(
              (node) => ({
                ...node,
                visibility: { ...node.visibility, fieldRows: next },
              }),
              "切换字段行显示",
            )
          }
        />
        <VisibilityToggle
          label="文档引用"
          mixedValue={docBadge}
          disabled={!canEdit}
          onToggle={(next) =>
            patchSelected(
              (node) => ({
                ...node,
                visibility: { ...node.visibility, docBadge: next },
              }),
              "切换文档引用显示",
            )
          }
        />
        <VisibilityToggle
          label="关系标签"
          mixedValue={edgeLabels}
          disabled={!canEdit}
          onToggle={(next) =>
            patchSelected(
              (node) => ({
                ...node,
                visibility: { ...node.visibility, edgeLabels: next },
              }),
              "切换关系标签显示",
            )
          }
        />
      </section>
    </div>
  );
}

function VisibilityToggle({
  label,
  mixedValue,
  disabled,
  onToggle,
}: {
  label: string;
  mixedValue: boolean | "mixed" | null;
  disabled: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <button
      className="us-canvas-toggle"
      type="button"
      disabled={disabled}
      aria-pressed={mixedValue === true}
      onClick={() => onToggle(mixedValue !== true)}
    >
      <span>{label}</span>
      <span className="us-data">{formatMixed(mixedValue)}</span>
    </button>
  );
}

function formatMixed(value: unknown): string {
  if (value === "mixed") return "混合";
  if (value === true) return "显示";
  if (value === false) return "隐藏";
  if (value === null || value === undefined) return "-";
  return String(value);
}
