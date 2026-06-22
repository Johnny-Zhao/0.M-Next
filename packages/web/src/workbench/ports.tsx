import { Handle, Position } from "@xyflow/react";
import type { ReactElement } from "react";

export type PortSide = "top" | "right" | "bottom" | "left";
export type PortKind = "source" | "target";

const portPositions: Readonly<Record<PortSide, Position>> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const portSides: readonly PortSide[] = ["top", "right", "bottom", "left"];

export function portHandleId(kind: PortKind, side: PortSide): string {
  return `${kind}-${side}`;
}

export function relationPortSides(
  source: { readonly x: number; readonly y: number },
  target: { readonly x: number; readonly y: number },
): { readonly sourceSide: PortSide; readonly targetSide: PortSide } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceSide: "right", targetSide: "left" }
      : { sourceSide: "left", targetSide: "right" };
  }
  return dy >= 0
    ? { sourceSide: "bottom", targetSide: "top" }
    : { sourceSide: "top", targetSide: "bottom" };
}

export function PortHandles(): ReactElement {
  return (
    <>
      {portSides.map((side) => (
        <Handle
          className={`object-node-port object-node-port-${side} object-node-port-target`}
          id={portHandleId("target", side)}
          key={`target-${side}`}
          position={portPositions[side]}
          type="target"
        />
      ))}
      {portSides.map((side) => (
        <Handle
          className={`object-node-port object-node-port-${side} object-node-port-source`}
          id={portHandleId("source", side)}
          key={`source-${side}`}
          position={portPositions[side]}
          type="source"
        />
      ))}
    </>
  );
}
