import { useEffect, useMemo, useState, type ReactElement } from "react";

import type {
  LineageNode,
  LineageView as ApiLineageView,
  ViewClient,
  ViewObject,
} from "@m-next/views";

export interface LineageViewProps {
  readonly workspaceId: string;
  readonly object: ViewObject;
  readonly fieldCode: string;
  readonly viewClient: Pick<ViewClient, "lineage">;
  readonly onClose: () => void;
}

type LineageStatus = "idle" | "loading" | "ready" | "error";

export function lineageFieldLabel(code: string): string {
  if (code === "length_m") return "长";
  if (code === "width_m") return "宽";
  if (code === "window_area_m2") return "窗面积";
  if (code === "area_fx" || code === "total_area_fx") return "面积";
  if (code === "window_floor_ratio_fx") return "窗地比";
  if (code === "orientation") return "朝向";
  return code;
}

export function lineageFieldValue(object: ViewObject, code: string): unknown {
  return object.derived?.[code] ?? object.fields[code];
}

export function formatLineageValue(code: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "未取到";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    const text = numeric.toLocaleString("zh-CN", {
      maximumFractionDigits: code === "window_floor_ratio_fx" ? 3 : 2,
    });
    if (code === "length_m" || code === "width_m") return `${text} m`;
    if (code === "area_fx" || code === "total_area_fx") return `${text} ㎡`;
    if (code === "window_area_m2") return `${text} ㎡`;
    return text;
  }
  if (code === "orientation") return orientationLabel(value);
  return String(value);
}

export function formatLineageExpression(
  fieldCode: string,
  view: ApiLineageView | null,
  object: ViewObject,
): string {
  const target = `${lineageFieldLabel(fieldCode)}(${formatLineageValue(
    fieldCode,
    lineageFieldValue(object, fieldCode),
  )})`;
  if (!view) return target;
  if (view.algorithm.kind === "stored") return `${target} 为存储字段`;
  const expression = view.algorithm.ref
    .replace(/field\(['"]([^'"]+)['"]\)/g, (_match, code: string) =>
      fieldToken(object, code),
    )
    .replace(/\*/g, "×")
    .replace(/\//g, "÷");
  return `${target} = ${expression}`;
}

export function lineageNodeText(node: LineageNode, object: ViewObject): string {
  const kind = lineageKindLabel(node.kind);
  const code = node.fieldCode;
  const name = code ? lineageFieldLabel(code) : (node.ref ?? node.objectType);
  const value =
    code && node.objectId === object.objectId
      ? ` · ${formatLineageValue(code, lineageFieldValue(object, code))}`
      : "";
  return name ? `${kind} · ${name}${value}` : kind;
}

export function LineageView({
  workspaceId,
  object,
  fieldCode,
  viewClient,
  onClose,
}: LineageViewProps): ReactElement {
  const [view, setView] = useState<ApiLineageView | null>(null);
  const [status, setStatus] = useState<LineageStatus>("idle");

  useEffect(() => {
    let disposed = false;
    setStatus("loading");
    void viewClient
      .lineage(workspaceId, object.objectId, fieldCode)
      .then((lineage) => {
        if (disposed) return;
        setView(lineage);
        setStatus("ready");
      })
      .catch(() => {
        if (disposed) return;
        setView(null);
        setStatus("error");
      });
    return () => {
      disposed = true;
    };
  }, [fieldCode, object.objectId, viewClient, workspaceId]);

  const expression = useMemo(
    () => formatLineageExpression(fieldCode, view, object),
    [fieldCode, object, view],
  );

  return (
    <div className="lineage-overlay" role="presentation">
      <section
        aria-label={`${lineageFieldLabel(fieldCode)} 血缘`}
        aria-modal="true"
        className="lineage-view"
        role="dialog"
      >
        <header className="lineage-view-head">
          <div>
            <span className="lineage-eyebrow">派生血缘</span>
            <h3>{lineageFieldLabel(fieldCode)}</h3>
          </div>
          <button aria-label="关闭血缘视图" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <p className="lineage-target">{expression}</p>
        {view?.partial || view?.truncated ? (
          <p className="lineage-flags">
            {view.partial ? "部分血缘" : null}
            {view.partial && view.truncated ? " · " : null}
            {view.truncated ? "结果已截断" : null}
          </p>
        ) : null}
        {status === "loading" ? <p className="lineage-muted">读取中…</p> : null}
        {status === "error" ? (
          <p className="lineage-muted">血缘读取失败</p>
        ) : null}
        {view ? <LineageLists object={object} view={view} /> : null}
      </section>
    </div>
  );
}

function LineageLists({
  object,
  view,
}: {
  readonly object: ViewObject;
  readonly view: ApiLineageView;
}): ReactElement {
  return (
    <div className="lineage-columns">
      <section>
        <h4>上游</h4>
        <LineageNodeList
          empty="无上游来源"
          nodes={view.upstream}
          object={object}
        />
      </section>
      <section>
        <h4>下游</h4>
        <LineageNodeList
          empty="无下游"
          nodes={view.downstream}
          object={object}
        />
      </section>
    </div>
  );
}

function LineageNodeList({
  empty,
  nodes,
  object,
}: {
  readonly empty: string;
  readonly nodes: readonly LineageNode[];
  readonly object: ViewObject;
}): ReactElement {
  if (nodes.length === 0) {
    return <p className="lineage-muted">{empty}</p>;
  }
  return (
    <ul className="lineage-node-list">
      {nodes.map((node, index) => (
        <li
          key={`${node.kind}-${node.objectId ?? ""}-${node.fieldCode ?? ""}-${index}`}
        >
          <span>{lineageNodeText(node, object)}</span>
          {node.depth > 0 ? <small>深度 {node.depth}</small> : null}
        </li>
      ))}
    </ul>
  );
}

function fieldToken(object: ViewObject, code: string): string {
  return `${lineageFieldLabel(code)}(${formatLineageValue(
    code,
    lineageFieldValue(object, code),
  )})`;
}

function lineageKindLabel(kind: LineageNode["kind"]): string {
  if (kind === "derived") return "派生";
  if (kind === "rule") return "规则";
  if (kind === "recommendation") return "推荐";
  return "字段";
}

function orientationLabel(value: unknown): string {
  const normalized = String(value).trim().toUpperCase();
  if (normalized === "N") return "北";
  if (normalized === "S") return "南";
  if (normalized === "E") return "东";
  if (normalized === "W") return "西";
  return String(value);
}
