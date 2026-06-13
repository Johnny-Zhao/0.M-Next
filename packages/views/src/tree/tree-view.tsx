import { useEffect, useState, type ReactElement } from "react";

import type { TreeNodeSummary, ViewClient } from "../api/view-client";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import type { SelectionRef } from "../selection/selection-ref";

export interface TreeBranch {
  readonly id: string;
  readonly depth: number;
  readonly children: readonly TreeBranch[];
}

export function buildTree(
  rootId: string,
  edges: readonly TreeNodeSummary[],
): TreeBranch {
  const children = new Map<string, TreeNodeSummary[]>();
  edges.forEach((edge) =>
    children.set(edge.sourceId, [...(children.get(edge.sourceId) ?? []), edge]),
  );
  const branch = (id: string, depth: number): TreeBranch => ({
    id,
    depth,
    children: (children.get(id) ?? [])
      .filter((edge) => edge.depth <= 5)
      .map((edge) => branch(edge.targetId, edge.depth)),
  });
  return branch(rootId, 0);
}

export interface TreeViewProps {
  readonly workspaceId: string;
  readonly relationType: string;
  readonly rootId: string;
  readonly client: ViewClient;
  readonly selection: SelectionCoordinator;
}

export function TreeView(props: TreeViewProps): ReactElement {
  const [tree, setTree] = useState<TreeBranch>(() =>
    buildTree(props.rootId, []),
  );
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  useEffect(() => {
    void props.client
      .tree(props.workspaceId, props.relationType, props.rootId)
      .then((edges) => setTree(buildTree(props.rootId, edges)));
    return props.selection.subscribe(setSelected);
  }, [
    props.client,
    props.relationType,
    props.rootId,
    props.selection,
    props.workspaceId,
  ]);
  return (
    <section aria-label="树视图">
      <TreeNode branch={tree} selected={selected} selection={props.selection} />
    </section>
  );
}

function TreeNode(props: {
  readonly branch: TreeBranch;
  readonly selected: SelectionRef | null;
  readonly selection: SelectionCoordinator;
}): ReactElement {
  return (
    <div style={{ marginLeft: `${props.branch.depth * 16}px` }}>
      <button
        className={
          props.selected?.entityId === props.branch.id ? "selected-node" : ""
        }
        onClick={() =>
          props.selection.select({
            entityType: "object",
            entityId: props.branch.id,
          })
        }
        type="button"
      >
        {props.branch.id}
      </button>
      {props.branch.children.map((child) => (
        <TreeNode
          branch={child}
          key={child.id}
          selected={props.selected}
          selection={props.selection}
        />
      ))}
    </div>
  );
}
