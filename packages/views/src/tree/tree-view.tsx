import { useEffect, useState, type ReactElement } from "react";

import type {
  TreeNodeSummary,
  ViewClient,
  ViewObject,
} from "../api/view-client";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import {
  isObjectSelected,
  type SelectionRef,
} from "../selection/selection-ref";
import { objectDisplayTitle } from "../display-labels";

export interface TreeBranch {
  readonly id: string;
  readonly label?: string;
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

export function buildFlatTree(
  objects: readonly ViewObject[],
): readonly TreeBranch[] {
  return objects.map((object) => ({
    id: object.objectId,
    label: treeObjectLabel(object),
    depth: 0,
    children: [],
  }));
}

export interface TreeViewProps {
  readonly workspaceId: string;
  readonly relationType: string;
  readonly rootId: string;
  readonly fallbackObjectType?: string;
  readonly client: ViewClient;
  readonly selection: SelectionCoordinator;
  readonly onError?: (message: string) => void;
}

export function supportsTreeRelation(relationType: string): boolean {
  return new Set([
    "decomposes_to",
    "contains",
    "proposal_contains_system",
    "proposal_contains_module",
  ]).has(relationType.trim());
}

export function treeEmptyMessage(rootId: string, relationType: string): string {
  if (rootId.trim() === "") return "请选择根对象后查看模型树。";
  if (!supportsTreeRelation(relationType)) return "该关系不支持树视图。";
  return "";
}

export function TreeView(props: TreeViewProps): ReactElement {
  const {
    client,
    fallbackObjectType,
    onError,
    relationType,
    rootId,
    selection,
    workspaceId,
  } = props;
  const [tree, setTree] = useState<TreeBranch>(() => buildTree(rootId, []));
  const [fallbackTree, setFallbackTree] = useState<readonly TreeBranch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  const useFallback =
    rootId.trim() === "" || !supportsTreeRelation(relationType);
  useEffect(() => {
    let disposed = false;
    async function load(): Promise<void> {
      setLoading(true);
      if (useFallback) {
        setTree(buildTree(rootId, []));
        if (!fallbackObjectType) {
          setFallbackTree([]);
          setLoading(false);
          return;
        }
        try {
          const page = await client.objects(
            workspaceId,
            fallbackObjectType,
            0,
            50,
          );
          if (!disposed) setFallbackTree(buildFlatTree(page.items));
        } catch (error) {
          if (!disposed) {
            setFallbackTree([]);
            onError?.(
              error instanceof Error ? error.message : "读取模型树失败",
            );
          }
        } finally {
          if (!disposed) setLoading(false);
        }
        return;
      }
      setTree(buildTree(rootId, []));
      setFallbackTree([]);
      try {
        const edges = await client.tree(workspaceId, relationType, rootId);
        if (!disposed) setTree(buildTree(rootId, edges));
      } catch (error) {
        if (!disposed) {
          setTree(buildTree(rootId, []));
          onError?.(error instanceof Error ? error.message : "读取模型树失败");
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [
    client,
    fallbackObjectType,
    onError,
    relationType,
    rootId,
    workspaceId,
    useFallback,
  ]);
  useEffect(() => selection.subscribe(setSelected), [selection]);
  const emptyMessage = treeEmptyMessage(rootId, relationType);
  return (
    <section aria-label="树视图" className="tree-view">
      {loading ? <p className="view-empty-state">模型树加载中...</p> : null}
      {useFallback && fallbackTree.length > 0 ? (
        fallbackTree.map((branch) => (
          <TreeNode
            branch={branch}
            key={branch.id}
            selected={selected}
            selection={selection}
          />
        ))
      ) : emptyMessage && !loading ? (
        <p className="view-empty-state">{emptyMessage}</p>
      ) : (
        <TreeNode branch={tree} selected={selected} selection={selection} />
      )}
    </section>
  );
}

function TreeNode(props: {
  readonly branch: TreeBranch;
  readonly selected: SelectionRef | null;
  readonly selection: SelectionCoordinator;
}): ReactElement {
  return (
    <div
      className="tree-node"
      style={{ marginLeft: `${props.branch.depth * 16}px` }}
    >
      <button
        className={
          isObjectSelected(props.selected, props.branch.id)
            ? "selected-node"
            : ""
        }
        onClick={() => selectTreeNode(props.selection, props.branch.id)}
        type="button"
      >
        {props.branch.label ?? props.branch.id}
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

function treeObjectLabel(object: ViewObject): string {
  return objectDisplayTitle(object);
}
