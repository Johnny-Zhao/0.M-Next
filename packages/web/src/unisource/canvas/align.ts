// Forked from packages/web/src/workbench/align.ts and adapted for UniSource canvas nodes.
export type CanvasAlignCommand =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "horizontalCenter"
  | "verticalCenter";

export type CanvasSizeCommand = "sameWidth" | "sameHeight" | "sameSize";

export interface CanvasAlignNode {
  readonly objectId: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
}

const fallbackSize = { w: 210, h: 124 } as const;

function width(node: CanvasAlignNode): number {
  return node.w ?? fallbackSize.w;
}

function height(node: CanvasAlignNode): number {
  return node.h ?? fallbackSize.h;
}

function selected<T extends CanvasAlignNode>(
  nodes: readonly T[],
  selectedIds: ReadonlySet<string>,
): T[] {
  return nodes.filter((node) => selectedIds.has(node.objectId));
}

function bounds(nodes: readonly CanvasAlignNode[]) {
  const left = Math.min(...nodes.map((node) => node.x));
  const right = Math.max(...nodes.map((node) => node.x + width(node)));
  const top = Math.min(...nodes.map((node) => node.y));
  const bottom = Math.max(...nodes.map((node) => node.y + height(node)));
  return {
    left,
    right,
    top,
    bottom,
    centerX: left + (right - left) / 2,
    centerY: top + (bottom - top) / 2,
  };
}

export function alignCanvasNodes<T extends CanvasAlignNode>(
  nodes: readonly T[],
  selectedIds: ReadonlySet<string>,
  command: CanvasAlignCommand,
): T[] {
  const picked = selected(nodes, selectedIds);
  if (picked.length < 2) return [...nodes];
  const group = bounds(picked);
  return nodes.map((node) => {
    if (!selectedIds.has(node.objectId)) return node;
    if (command === "left") return { ...node, x: group.left };
    if (command === "right") return { ...node, x: group.right - width(node) };
    if (command === "top") return { ...node, y: group.top };
    if (command === "bottom")
      return { ...node, y: group.bottom - height(node) };
    if (command === "horizontalCenter")
      return { ...node, x: group.centerX - width(node) / 2 };
    return { ...node, y: group.centerY - height(node) / 2 };
  });
}

export function sizeCanvasNodes<T extends CanvasAlignNode>(
  nodes: readonly T[],
  selectedIds: ReadonlySet<string>,
  command: CanvasSizeCommand,
): T[] {
  const picked = selected(nodes, selectedIds);
  if (picked.length < 2) return [...nodes];
  const targetWidth = width(picked[0]!);
  const targetHeight = height(picked[0]!);
  return nodes.map((node) => {
    if (!selectedIds.has(node.objectId)) return node;
    return {
      ...node,
      w: command === "sameHeight" ? node.w : targetWidth,
      h: command === "sameWidth" ? node.h : targetHeight,
    };
  });
}
