import { useEffect, useState, type ReactElement } from "react";

import type { TreeNodeSummary, ViewClient } from "../api/view-client";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import {
  isObjectSelected,
  type SelectionRef,
} from "../selection/selection-ref";

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

export function supportsTreeRelation(relationType: string): boolean {
  return new Set([
    "decomposes_to",
    "proposal_contains_system",
    "proposal_contains_module",
  ]).has(relationType.trim());
}

export function TreeView(props: TreeViewProps): ReactElement {
  const [tree, setTree] = useState<TreeBranch>(() =>
    buildTree(props.rootId, []),
  );
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  useEffect(() => {
    if (
      props.rootId.trim() === "" ||
      !supportsTreeRelation(props.relationType)
    ) {
      setTree(buildTree(props.rootId, []));
      return;
    }
    void props.client
      .tree(props.workspaceId, props.relationType, props.rootId)
      .then((edges) => setTree(buildTree(props.rootId, edges)));
  }, [props.client, props.relationType, props.rootId, props.workspaceId]);
  useEffect(() => props.selection.subscribe(setSelected), [props.selection]);
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
          isObjectSelected(props.selected, props.branch.id)
            ? "selected-node"
            : ""
        }
        onClick={() => selectTreeNode(props.selection, props.branch.id)}
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

export function selectTreeNode(
  selection: SelectionCoordinator,
  entityId: string,
): void {
  selection.select({ entityType: "object", entityId });
}
