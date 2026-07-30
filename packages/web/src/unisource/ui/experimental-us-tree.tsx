import { Empty, Spin, Tree, type TreeDataNode, type TreeProps } from "antd";
import type { ReactNode } from "react";

import {
  treeStateFor,
  type ExperimentalUsTreeDropIntent,
  type ExperimentalUsTreeNode,
} from "./experimental-us-tree-model";

export interface ExperimentalUsTreeProps {
  readonly nodes: readonly ExperimentalUsTreeNode[];
  readonly expandedKeys: readonly string[];
  readonly selectedKeys: readonly string[];
  readonly loadedKeys?: readonly string[];
  readonly searchQuery?: string;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly draggable?: boolean;
  readonly height?: number;
  readonly onExpandedKeysChange: (keys: readonly string[]) => void;
  readonly onSelectedKeysChange: (keys: readonly string[]) => void;
  readonly onLoadNode?: (key: string) => Promise<void>;
  readonly onContextMenu?: (key: string) => void;
  readonly onDropIntent?: (intent: ExperimentalUsTreeDropIntent) => void;
}

function title(label: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return label;
  const index = label.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return label;
  return (
    <>
      {label.slice(0, index)}
      <mark>{label.slice(index, index + needle.length)}</mark>
      {label.slice(index + needle.length)}
    </>
  );
}

function toTreeData(
  nodes: readonly ExperimentalUsTreeNode[],
  query: string,
): TreeDataNode[] {
  return nodes.map((node) => ({
    key: node.key,
    title: title(node.label, query),
    isLeaf: !node.lazy && !node.children?.length,
    children: node.children ? toTreeData(node.children, query) : undefined,
  }));
}

function findNode(
  nodes: readonly ExperimentalUsTreeNode[],
  key: string,
): ExperimentalUsTreeNode | undefined {
  for (const node of nodes) {
    if (node.key === key) return node;
    const child = node.children ? findNode(node.children, key) : undefined;
    if (child) return child;
  }
  return undefined;
}

/** Ant Design stays behind this UniSource-only controlled tree contract. */
export function ExperimentalUsTree({
  nodes,
  expandedKeys,
  selectedKeys,
  loadedKeys,
  searchQuery = "",
  loading = false,
  error = null,
  draggable = false,
  height = 280,
  onExpandedKeysChange,
  onSelectedKeysChange,
  onLoadNode,
  onContextMenu,
  onDropIntent,
}: ExperimentalUsTreeProps) {
  const state = treeStateFor(nodes, loading, error);
  if (state === "loading") return <Spin aria-label="正在加载目录" />;
  if (state === "error") return <Empty description={error} />;
  if (state === "empty") return <Empty description="暂无目录节点" />;

  return (
    <Tree
      blockNode
      draggable={
        draggable
          ? {
              nodeDraggable: (node) =>
                findNode(nodes, String(node.key))?.kind === "directory",
            }
          : false
      }
      expandedKeys={[...expandedKeys]}
      height={height}
      loadedKeys={loadedKeys ? [...loadedKeys] : undefined}
      loadData={
        onLoadNode
          ? async (node) => {
              await onLoadNode(String(node.key));
            }
          : undefined
      }
      onDrop={
        onDropIntent
          ? (info: Parameters<NonNullable<TreeProps["onDrop"]>>[0]) =>
              onDropIntent({
                dragKey: String(info.dragNode.key),
                dropKey: String(info.node.key),
                dropPosition: info.dropPosition,
                dropToGap: info.dropToGap,
              })
          : undefined
      }
      onExpand={(keys) => onExpandedKeysChange(keys.map(String))}
      onRightClick={({ node }) => onContextMenu?.(String(node.key))}
      onSelect={(keys) => onSelectedKeysChange(keys.map(String))}
      selectedKeys={[...selectedKeys]}
      treeData={toTreeData(nodes, searchQuery)}
      virtual
    />
  );
}
