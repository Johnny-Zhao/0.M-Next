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
  if (selected) return { color: "#1677ff", strokeWidth: 3 };
  if (data.ruleState === "failed") return { color: "#d4380d", strokeWidth: 3 };
  if (data.status === "UNLINKED") {
    return { color: "#8c9bab", strokeWidth: 2, strokeDasharray: "7 5" };
  }
  const normalized = data.relationType.toLowerCase();
  if (normalized.includes("decompose") || normalized.includes("contain")) {
    return { color: "#315b7d", strokeWidth: 2.5 };
  }
  if (normalized.includes("depend") || normalized.includes("require")) {
    return { color: "#8a5a00", strokeWidth: 2, strokeDasharray: "9 4" };
  }
  if (normalized.includes("trace") || normalized.includes("verify")) {
    return { color: "#2d6a4f", strokeWidth: 2 };
  }
  return { color: "#6b5b95", strokeWidth: 2 };
}

export function DataRelationEdge({
  data,
  id,
  markerEnd,
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
    strokeWidth: visual.strokeWidth,
  };
  return (
    <>
      <BaseEdge id={id} markerEnd={markerEnd} path={edgePath} style={style} />
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

export const dataRelationMarker = {
  type: MarkerType.ArrowClosed,
  width: 18,
  height: 18,
};

export const edgeTypes = { dataRelation: DataRelationEdge };
