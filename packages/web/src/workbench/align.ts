export type AlignCommand =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "horizontalCenter"
  | "verticalCenter";

export type DistributeCommand = "horizontal" | "vertical";

export interface AlignableNode {
  readonly id: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  readonly width?: number;
  readonly height?: number;
  readonly measured?: {
    readonly width?: number;
    readonly height?: number;
  };
}

const fallbackSize = {
  width: 192,
  height: 96,
} as const;

function nodeWidth(node: AlignableNode): number {
  return node.width ?? node.measured?.width ?? fallbackSize.width;
}

function nodeHeight(node: AlignableNode): number {
  return node.height ?? node.measured?.height ?? fallbackSize.height;
}

function bounds(nodes: readonly AlignableNode[]) {
  const left = Math.min(...nodes.map((node) => node.position.x));
  const right = Math.max(
    ...nodes.map((node) => node.position.x + nodeWidth(node)),
  );
  const top = Math.min(...nodes.map((node) => node.position.y));
  const bottom = Math.max(
    ...nodes.map((node) => node.position.y + nodeHeight(node)),
  );
  return {
    left,
    right,
    top,
    bottom,
    centerX: left + (right - left) / 2,
    centerY: top + (bottom - top) / 2,
  };
}

function selectedNodes<T extends AlignableNode>(
  nodes: readonly T[],
  selectedIds: ReadonlySet<string>,
): T[] {
  return nodes.filter((node) => selectedIds.has(node.id));
}

export function alignNodes<T extends AlignableNode>(
  nodes: readonly T[],
  selectedIds: ReadonlySet<string>,
  command: AlignCommand,
): T[] {
  const selected = selectedNodes(nodes, selectedIds);
  if (selected.length < 2) return [...nodes];

  const groupBounds = bounds(selected);
  return nodes.map((node) => {
    if (!selectedIds.has(node.id)) return node;
    const width = nodeWidth(node);
    const height = nodeHeight(node);
    const position = { ...node.position };

    if (command === "left") position.x = groupBounds.left;
    if (command === "right") position.x = groupBounds.right - width;
    if (command === "top") position.y = groupBounds.top;
    if (command === "bottom") position.y = groupBounds.bottom - height;
    if (command === "horizontalCenter") {
      position.x = groupBounds.centerX - width / 2;
    }
    if (command === "verticalCenter") {
      position.y = groupBounds.centerY - height / 2;
    }

    return { ...node, position };
  });
}

export function distributeNodes<T extends AlignableNode>(
  nodes: readonly T[],
  selectedIds: ReadonlySet<string>,
  command: DistributeCommand,
): T[] {
  const selected = selectedNodes(nodes, selectedIds);
  if (selected.length < 3) return [...nodes];

  const sorted = [...selected].sort((left, right) =>
    command === "horizontal"
      ? left.position.x - right.position.x
      : left.position.y - right.position.y,
  );
  const groupBounds = bounds(sorted);
  const totalSize = sorted.reduce(
    (sum, node) =>
      sum + (command === "horizontal" ? nodeWidth(node) : nodeHeight(node)),
    0,
  );
  const span =
    command === "horizontal"
      ? groupBounds.right - groupBounds.left
      : groupBounds.bottom - groupBounds.top;
  const gap = (span - totalSize) / (sorted.length - 1);
  let cursor = command === "horizontal" ? groupBounds.left : groupBounds.top;
  const nextPositions = new Map<string, number>();

  for (const node of sorted) {
    nextPositions.set(node.id, cursor);
    cursor +=
      (command === "horizontal" ? nodeWidth(node) : nodeHeight(node)) + gap;
  }

  return nodes.map((node) => {
    const nextPosition = nextPositions.get(node.id);
    if (nextPosition === undefined) return node;
    return {
      ...node,
      position:
        command === "horizontal"
          ? { ...node.position, x: nextPosition }
          : { ...node.position, y: nextPosition },
    };
  });
}
