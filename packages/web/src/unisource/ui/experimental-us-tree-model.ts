export type ExperimentalUsTreeNodeKind =
  | "directory"
  | "record-library"
  | "record"
  | "field";

export interface ExperimentalUsTreeNode {
  readonly key: string;
  readonly label: string;
  readonly kind: ExperimentalUsTreeNodeKind;
  readonly children?: readonly ExperimentalUsTreeNode[];
  readonly lazy?: boolean;
}

export interface ExperimentalUsTreeDropIntent {
  readonly dragKey: string;
  readonly dropKey: string;
  readonly dropPosition: number;
  readonly dropToGap: boolean;
}

export type ExperimentalUsTreeState = "ready" | "loading" | "empty" | "error";

export function deriveExperimentalTreeSearch(
  nodes: readonly ExperimentalUsTreeNode[],
  query: string,
): {
  readonly matches: ReadonlySet<string>;
  readonly expandedKeys: readonly string[];
} {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = new Set<string>();
  const ancestors = new Set<string>();

  const visit = (
    items: readonly ExperimentalUsTreeNode[],
    parents: readonly string[],
  ) => {
    for (const item of items) {
      if (normalized && item.label.toLocaleLowerCase().includes(normalized)) {
        matches.add(item.key);
        parents.forEach((key) => ancestors.add(key));
      }
      if (item.children) visit(item.children, [...parents, item.key]);
    }
  };
  visit(nodes, []);
  return { matches, expandedKeys: [...ancestors] };
}

export function filterExperimentalTree(
  nodes: readonly ExperimentalUsTreeNode[],
  matches: ReadonlySet<string>,
): ExperimentalUsTreeNode[] {
  return nodes.flatMap((node) => {
    const children = node.children
      ? filterExperimentalTree(node.children, matches)
      : undefined;
    if (!matches.has(node.key) && !children?.length) return [];
    return [{ ...node, children }];
  });
}

/** Preview-only: reorder directory siblings without changing their hierarchy. */
export function reorderExperimentalDirectorySiblings(
  nodes: readonly ExperimentalUsTreeNode[],
  intent: ExperimentalUsTreeDropIntent,
): { readonly moved: boolean; readonly nodes: ExperimentalUsTreeNode[] } {
  if (!intent.dropToGap || intent.dragKey === intent.dropKey) {
    return { moved: false, nodes: [...nodes] };
  }
  const dragIndex = nodes.findIndex((node) => node.key === intent.dragKey);
  const dropIndex = nodes.findIndex((node) => node.key === intent.dropKey);
  const dragged = nodes[dragIndex];
  const dropped = nodes[dropIndex];
  if (
    dragIndex < 0 ||
    dropIndex < 0 ||
    dragged?.kind !== "directory" ||
    dropped?.kind !== "directory"
  ) {
    return { moved: false, nodes: [...nodes] };
  }

  const remaining = nodes.filter((node) => node.key !== intent.dragKey);
  const targetIndex = remaining.findIndex(
    (node) => node.key === intent.dropKey,
  );
  const insertAt = targetIndex + (intent.dropPosition > 0 ? 1 : 0);
  return {
    moved: true,
    nodes: [
      ...remaining.slice(0, insertAt),
      dragged,
      ...remaining.slice(insertAt),
    ],
  };
}

export function treeStateFor(
  nodes: readonly ExperimentalUsTreeNode[],
  loading: boolean,
  error: string | null,
): ExperimentalUsTreeState {
  if (error) return "error";
  if (loading) return "loading";
  return nodes.length === 0 ? "empty" : "ready";
}
