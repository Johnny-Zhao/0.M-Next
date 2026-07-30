import { Empty, Spin, Tree, type TreeDataNode } from "antd";
import { useMemo } from "react";

import "./ant-bridge.css";

import type { DataCatalogTreeNode } from "../data/data-catalog-tree-model";

export interface UsDataCatalogTreeProps {
  readonly nodes: readonly DataCatalogTreeNode[];
  readonly expandedKeys: readonly string[];
  readonly selectedKeys: readonly string[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly searchHint?: string | null;
  readonly searchEmptyMessage?: string | null;
  readonly onExpandedKeysChange: (keys: readonly string[]) => void;
  readonly onLibraryOpen: (objectTypeCode: string) => void;
  readonly onRecordLibraryExpand: (objectTypeCode: string) => void;
  readonly onRecordOpen: (objectTypeCode: string, objectId: string) => void;
  readonly onLoadMore: (objectTypeCode: string) => void;
  readonly onRetryRecords: (objectTypeCode: string) => void;
  readonly onRetry: () => void;
}

/** Read-only catalog adapter; Ant Design details do not leave unisource/ui. */
export function UsDataCatalogTree({
  nodes,
  expandedKeys,
  selectedKeys,
  loading,
  error,
  searchHint,
  searchEmptyMessage,
  onExpandedKeysChange,
  onLibraryOpen,
  onRecordLibraryExpand,
  onRecordOpen,
  onLoadMore,
  onRetryRecords,
  onRetry,
}: UsDataCatalogTreeProps) {
  const nodeByKey = useMemo(() => indexNodes(nodes), [nodes]);
  const treeData = useMemo(() => toTreeData(nodes), [nodes]);
  if (loading) return <Spin aria-label="正在读取数据目录" size="small" />;
  if (error) {
    return (
      <div className="us-catalog-tree__state" role="alert">
        <span>数据目录读取失败：{error}</span>
        <button onClick={onRetry} type="button">
          重试
        </button>
      </div>
    );
  }
  if (searchEmptyMessage || !nodes.length) {
    return (
      <Empty
        description={searchEmptyMessage ?? "当前工作空间未配置数据目录"}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }
  return (
    <>
      {searchHint ? (
        <p className="us-catalog-tree__search-hint">{searchHint}</p>
      ) : null}
      <Tree
        aria-label="数据目录"
        blockNode
        expandedKeys={[...expandedKeys]}
        onExpand={(keys, info) => {
          applyCatalogTreeExpand(
            nodeByKey.get(String(info.node.key)),
            keys.map(String),
            info.expanded,
            {
              onExpandedKeysChange,
              onRecordLibraryExpand,
            },
          );
        }}
        onSelect={(keys) => {
          applyCatalogTreeSelect(
            nodeByKey.get(String(keys[0] ?? "")),
            expandedKeys,
            {
              onExpandedKeysChange,
              onLibraryOpen,
              onRecordOpen,
              onLoadMore,
              onRetryRecords,
            },
          );
        }}
        selectedKeys={[...selectedKeys]}
        showLine={false}
        treeData={treeData}
        virtual={false}
      />
    </>
  );
}

export function recordLibraryToLoad(
  node: DataCatalogTreeNode | undefined,
  expanded: boolean,
): string | null {
  return expanded && node?.kind === "record-library" && node.objectTypeCode
    ? node.objectTypeCode
    : null;
}

type CatalogTreeExpandCallbacks = Pick<
  UsDataCatalogTreeProps,
  "onExpandedKeysChange" | "onRecordLibraryExpand"
>;

export function applyCatalogTreeExpand(
  node: DataCatalogTreeNode | undefined,
  keys: readonly string[],
  expanded: boolean,
  callbacks: CatalogTreeExpandCallbacks,
): void {
  callbacks.onExpandedKeysChange(keys);
  const objectTypeCode = recordLibraryToLoad(node, expanded);
  if (objectTypeCode) callbacks.onRecordLibraryExpand(objectTypeCode);
}

type CatalogTreeSelectCallbacks = Pick<
  UsDataCatalogTreeProps,
  | "onExpandedKeysChange"
  | "onLibraryOpen"
  | "onRecordOpen"
  | "onLoadMore"
  | "onRetryRecords"
>;

export function applyCatalogTreeSelect(
  node: DataCatalogTreeNode | undefined,
  expandedKeys: readonly string[],
  callbacks: CatalogTreeSelectCallbacks,
): void {
  if (!node || node.disabled) return;
  if (node.kind === "directory") {
    callbacks.onExpandedKeysChange(toggleKey(expandedKeys, node.key));
    return;
  }
  if (node.kind === "record-library" && node.objectTypeCode) {
    callbacks.onLibraryOpen(node.objectTypeCode);
    return;
  }
  if (node.kind === "record" && node.objectTypeCode && node.objectId) {
    callbacks.onRecordOpen(node.objectTypeCode, node.objectId);
    return;
  }
  if (node.kind === "record-action" && node.objectTypeCode) {
    if (node.action === "load-more") callbacks.onLoadMore(node.objectTypeCode);
    if (node.action === "retry") callbacks.onRetryRecords(node.objectTypeCode);
  }
}

function toTreeData(nodes: readonly DataCatalogTreeNode[]): TreeDataNode[] {
  return nodes.map((node) => ({
    key: node.key,
    disabled: node.disabled,
    title: <CatalogTreeTitle node={node} />,
    children: node.children ? toTreeData(node.children) : undefined,
  }));
}

function CatalogTreeTitle({ node }: { readonly node: DataCatalogTreeNode }) {
  const title = [node.label, ...(node.diagnostics ?? [])].join(" · ");
  return (
    <span
      className="us-catalog-tree__title"
      data-active={node.active ? "true" : undefined}
      data-kind={node.kind}
      title={title}
    >
      <span aria-hidden className="us-catalog-tree__mark" />
      <span className="us-catalog-tree__label">{node.label}</span>
      {node.recordCount !== undefined ? (
        <small className="us-catalog-tree__count">{node.recordCount}</small>
      ) : null}
      {node.diagnostics?.map((diagnostic) => (
        <small className="us-catalog-tree__diagnostic" key={diagnostic}>
          {diagnostic}
        </small>
      ))}
    </span>
  );
}

function indexNodes(
  nodes: readonly DataCatalogTreeNode[],
  indexed = new Map<string, DataCatalogTreeNode>(),
): ReadonlyMap<string, DataCatalogTreeNode> {
  for (const node of nodes) {
    indexed.set(node.key, node);
    indexNodes(node.children ?? [], indexed);
  }
  return indexed;
}

function toggleKey(keys: readonly string[], key: string): readonly string[] {
  return keys.includes(key)
    ? keys.filter((item) => item !== key)
    : [...keys, key];
}
