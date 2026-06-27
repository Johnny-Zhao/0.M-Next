import {
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import type { CSSProperties, ReactElement } from "react";

export type DiagramEdgeRoute = "orthogonal" | "curved";
export type DiagramEdgeStatus = "ACTIVE" | "UNLINKED";
export type DiagramRuleState = "failed" | "normal";

export interface DiagramEdgeData extends Record<string, unknown> {
  readonly relationType: string;
  readonly label: string;
  readonly route: DiagramEdgeRoute;
  readonly status?: DiagramEdgeStatus;
  readonly version?: number;
  readonly ruleState?: DiagramRuleState;
}

export interface DiagramEdgeVisual {
  readonly color: string;
  readonly strokeWidth: number;
  readonly strokeDasharray?: string;
  readonly strokeLinecap?: CSSProperties["strokeLinecap"];
  readonly marker: "arrow" | "none";
  readonly className: string;
}

export function relationRoute(relationType: string): DiagramEdgeRoute {
  const normalized = relationType.toLowerCase();
  if (
    normalized.includes("decompose") ||
    normalized.includes("contain") ||
    normalized.includes("parent") ||
    normalized.includes("depend") ||
    normalized.includes("require")
  ) {
    return "orthogonal";
  }
  return "curved";
}

export function relationEdgeVisual(
  data: DiagramEdgeData,
  selected: boolean,
): DiagramEdgeVisual {
  if (selected) {
    return edgeVisual("var(--mn-accent)", 3, "diagram-edge-selected");
  }
  if (data.ruleState === "failed") {
    return edgeVisual("var(--mn-bad)", 3, "diagram-edge-failed");
  }
  if (data.status === "UNLINKED") {
    return edgeVisual("var(--mn-ink-3)", 1.8, "diagram-edge-unlinked", {
      marker: "none",
      strokeDasharray: "7 5",
    });
  }
  const normalized = data.relationType.toLowerCase();
  if (normalized.includes("adjacent")) {
    return edgeVisual("var(--mn-ink-3)", 1.6, "diagram-edge-adjacent", {
      marker: "none",
      strokeDasharray: "2 6",
      strokeLinecap: "round",
    });
  }
  if (normalized.includes("decompose") || normalized.includes("contain")) {
    return edgeVisual("var(--mn-border-3)", 2.2, "diagram-edge-hierarchy");
  }
  if (normalized.includes("depend") || normalized.includes("require")) {
    return edgeVisual("var(--mn-warn)", 2, "diagram-edge-dependency", {
      strokeDasharray: "9 4",
    });
  }
  if (normalized.includes("trace") || normalized.includes("verify")) {
    return edgeVisual("var(--mn-ink-2)", 1.9, "diagram-edge-trace");
  }
  return edgeVisual("var(--mn-ink-2)", 1.9, "diagram-edge-default");
}

function edgeVisual(
  color: string,
  strokeWidth: number,
  className: string,
  options: Partial<
    Pick<DiagramEdgeVisual, "marker" | "strokeDasharray" | "strokeLinecap">
  > = {},
): DiagramEdgeVisual {
  const visual: DiagramEdgeVisual = {
    color,
    strokeWidth,
    className,
    marker: options.marker ?? "arrow",
  };
  if (options.strokeDasharray) {
    return options.strokeLinecap
      ? {
          ...visual,
          strokeDasharray: options.strokeDasharray,
          strokeLinecap: options.strokeLinecap,
        }
      : { ...visual, strokeDasharray: options.strokeDasharray };
  }
  return options.strokeLinecap
    ? { ...visual, strokeLinecap: options.strokeLinecap }
    : visual;
}

export function DataRelationEdge({
  data,
  id,
  selected = false,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps): ReactElement {
  const edgeData = data as DiagramEdgeData;
  const [edgePath, labelX, labelY] =
    edgeData.route === "orthogonal"
      ? getSmoothStepPath({
          borderRadius: 10,
          sourcePosition,
          sourceX,
          sourceY,
          targetPosition,
          targetX,
          targetY,
        })
      : getBezierPath({
          sourcePosition,
          sourceX,
          sourceY,
          targetPosition,
          targetX,
          targetY,
        });
  const visual = relationEdgeVisual(edgeData, selected);
  const style: CSSProperties = {
    stroke: visual.color,
    strokeDasharray: visual.strokeDasharray,
    strokeLinecap: visual.strokeLinecap,
    strokeWidth: visual.strokeWidth,
  };
  const markerId = `diagram-edge-marker-${cssSafeId(id)}`;
  return (
    <>
      {visual.marker === "arrow" ? (
        <svg aria-hidden="true" className="diagram-edge-marker-defs">
          <defs>
            <marker
              id={markerId}
              markerHeight="10"
              markerWidth="10"
              orient="auto-start-reverse"
              refX="9"
              refY="5"
              viewBox="0 0 10 10"
            >
              <path d="M1 1 9 5 1 9z" fill={visual.color} />
            </marker>
          </defs>
        </svg>
      ) : null}
      <BaseEdge
        className={`diagram-edge-path ${visual.className}`}
        id={id}
        markerEnd={visual.marker === "arrow" ? `url(#${markerId})` : undefined}
        path={edgePath}
        style={style}
      />
      <EdgeLabelRenderer>
        <div
          className={
            selected
              ? "diagram-edge-label diagram-edge-label-selected"
              : "diagram-edge-label"
          }
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {edgeData.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function cssSafeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export const dataRelationMarker = {
  type: MarkerType.ArrowClosed,
  width: 18,
  height: 18,
};

export const edgeTypes = { dataRelation: DataRelationEdge };
