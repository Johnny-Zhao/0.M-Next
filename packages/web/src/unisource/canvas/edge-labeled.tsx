import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export function EdgeLabeled(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const label = String(props.data?.label ?? "");
  const showLabel = props.data?.showLabel !== false;
  const flowing = props.data?.flowing === true;
  return (
    <>
      <BaseEdge className="us-canvas-edge" data-flowing={flowing} path={path} />
      {showLabel && label ? (
        <EdgeLabelRenderer>
          <span
            className="us-canvas-edge__label us-data"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
