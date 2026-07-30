import type { DataCatalogTreeNode } from "./data-catalog-tree-model";

export interface DataCatalogTreeSearchResult {
  readonly nodes: readonly DataCatalogTreeNode[];
  readonly query: string;
  readonly automaticExpandedKeys: readonly string[];
  readonly hasLoadedMatch: boolean;
  readonly hasUnloadedLibraries: boolean;
}

/** Filters only the catalog tree already in memory; it never reads record pages. */
export function filterDataCatalogTree(
  nodes: readonly DataCatalogTreeNode[],
  search: string,
): DataCatalogTreeSearchResult {
  const query = normalize(search);
  if (!query) {
    return {
      nodes,
      query,
      automaticExpandedKeys: [],
      hasLoadedMatch: false,
      hasUnloadedLibraries: false,
    };
  }
  const automaticExpandedKeys = new Set<string>();
  let hasLoadedMatch = false;
  const hasUnloadedLibraries = containsUnloadedLibrary(nodes);

  const visit = (node: DataCatalogTreeNode): DataCatalogTreeNode | null => {
    const ownMatch = matches(node, query);
    if (node.kind === "directory") {
      if (ownMatch) {
        hasLoadedMatch = true;
        automaticExpandedKeys.add(node.key);
        return node;
      }
      const children = (node.children ?? [])
        .map(visit)
        .filter((child): child is DataCatalogTreeNode => child !== null);
      if (!children.length) return null;
      automaticExpandedKeys.add(node.key);
      return { ...node, children };
    }
    if (node.kind === "record-library") {
      if (ownMatch) {
        hasLoadedMatch = true;
        automaticExpandedKeys.add(node.key);
        return node;
      }
      if (node.recordLoadStatus !== "loaded") {
        return null;
      }
      const records = (node.children ?? []).filter(
        (child) => child.kind === "record" && matches(child, query),
      );
      if (!records.length) return null;
      hasLoadedMatch = true;
      automaticExpandedKeys.add(node.key);
      const actions = (node.children ?? []).filter(
        (child) => child.kind === "record-action",
      );
      return { ...node, children: [...records, ...actions] };
    }
    return ownMatch ? node : null;
  };

  const matchingNodes = nodes.map(visit).filter(isNode);
  const filtered =
    matchingNodes.length || !hasUnloadedLibraries
      ? matchingNodes
      : retainUnloadedLibraries(nodes, automaticExpandedKeys);
  return {
    nodes: filtered,
    query,
    automaticExpandedKeys: [...automaticExpandedKeys],
    hasLoadedMatch,
    hasUnloadedLibraries,
  };
}

function containsUnloadedLibrary(
  nodes: readonly DataCatalogTreeNode[],
): boolean {
  return nodes.some(
    (node) =>
      (node.kind === "record-library" && node.recordLoadStatus !== "loaded") ||
      containsUnloadedLibrary(node.children ?? []),
  );
}

function retainUnloadedLibraries(
  nodes: readonly DataCatalogTreeNode[],
  expandedKeys: Set<string>,
): readonly DataCatalogTreeNode[] {
  return nodes
    .map((node) => {
      if (
        node.kind === "record-library" &&
        node.recordLoadStatus !== "loaded"
      ) {
        expandedKeys.add(node.key);
        return node;
      }
      if (node.kind !== "directory") return null;
      const children = retainUnloadedLibraries(
        node.children ?? [],
        expandedKeys,
      );
      if (!children.length) return null;
      expandedKeys.add(node.key);
      return { ...node, children };
    })
    .filter(isNode);
}

function isNode(node: DataCatalogTreeNode | null): node is DataCatalogTreeNode {
  return node !== null;
}

function matches(node: DataCatalogTreeNode, query: string): boolean {
  return (node.searchTerms ?? [node.label]).some((term) =>
    normalize(term).includes(query),
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
