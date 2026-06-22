import { ViewportPortal } from "@xyflow/react";
import type { ReactElement } from "react";

import type { AlignableNode } from "./align";

export interface SmartGuides {
  readonly x: readonly number[];
  readonly y: readonly number[];
}

const emptyGuides: SmartGuides = { x: [], y: [] };
const guideThreshold = 6;

function widthOf(node: AlignableNode): number {
  return node.width ?? node.measured?.width ?? 192;
}

function heightOf(node: AlignableNode): number {
  return node.height ?? node.measured?.height ?? 96;
}

function anchorsX(node: AlignableNode): number[] {
  const width = widthOf(node);
  return [
    node.position.x,
    node.position.x + width / 2,
    node.position.x + width,
  ];
}

function anchorsY(node: AlignableNode): number[] {
  const height = heightOf(node);
  return [
    node.position.y,
    node.position.y + height / 2,
    node.position.y + height,
  ];
}

function uniqueGuides(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value)))];
}

export function calculateSmartGuides(
  activeNode: AlignableNode | null,
  nodes: readonly AlignableNode[],
): SmartGuides {
  if (!activeNode) return emptyGuides;

  const x: number[] = [];
  const y: number[] = [];
  const activeX = anchorsX(activeNode);
  const activeY = anchorsY(activeNode);

  for (const node of nodes) {
    if (node.id === activeNode.id) continue;
    for (const candidate of anchorsX(node)) {
      if (
        activeX.some((anchor) => Math.abs(anchor - candidate) <= guideThreshold)
      ) {
        x.push(candidate);
      }
    }
    for (const candidate of anchorsY(node)) {
      if (
        activeY.some((anchor) => Math.abs(anchor - candidate) <= guideThreshold)
      ) {
        y.push(candidate);
      }
    }
  }

  return { x: uniqueGuides(x), y: uniqueGuides(y) };
}

interface SmartGuidesOverlayProps {
  readonly guides: SmartGuides;
}

export function SmartGuidesOverlay({
  guides,
}: SmartGuidesOverlayProps): ReactElement | null {
  if (guides.x.length === 0 && guides.y.length === 0) return null;

  return (
    <ViewportPortal>
      <div className="diagram-guides" aria-hidden="true">
        {guides.x.map((x) => (
          <div
            className="diagram-guide diagram-guide-vertical"
            key={`x-${x}`}
            style={{ transform: `translateX(${x}px)` }}
          />
        ))}
        {guides.y.map((y) => (
          <div
            className="diagram-guide diagram-guide-horizontal"
            key={`y-${y}`}
            style={{ transform: `translateY(${y}px)` }}
          />
        ))}
      </div>
    </ViewportPortal>
  );
}
