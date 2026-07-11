import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export function TemplateEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const label = String(props.data?.label ?? "");
  const solid = props.data?.solid === true;
  return (
    <>
      <BaseEdge
        className="us-template-edge"
        data-solid={solid}
        markerEnd={props.markerEnd}
        path={path}
      />
      <EdgeLabelRenderer>
        <span
          className="us-template-edge__label us-data"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {label}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
