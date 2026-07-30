import type { ObjectTypeDef } from "../model/kernel";
import type {
  DataCatalogLibraryRecords,
  DataCatalogRecordLoadStatus,
} from "../state/data-catalog-store";
import type { WorkspaceDataCatalog } from "./gateway";

export type DataCatalogTreeNodeKind =
  | "directory"
  | "record-library"
  | "record"
  | "record-action"
  | "diagnostic";

export interface DataCatalogTreeNode {
  readonly key: string;
  readonly label: string;
  readonly kind: DataCatalogTreeNodeKind;
  readonly children?: readonly DataCatalogTreeNode[];
  readonly diagnostics?: readonly string[];
  readonly disabled?: boolean;
  readonly objectTypeCode?: string;
  readonly objectId?: string;
  readonly recordCount?: number;
  readonly action?: "load-more" | "retry";
  readonly active?: boolean;
  readonly searchTerms?: readonly string[];
  readonly recordLoadStatus?: DataCatalogRecordLoadStatus;
}

export interface DataCatalogTreeModel {
  readonly nodes: readonly DataCatalogTreeNode[];
  readonly selectedKeys: readonly string[];
  readonly expandedKeys: readonly string[];
}

interface Directory {
  readonly code: string;
  readonly name: string;
  readonly parentCode: string | null;
  readonly sortOrder: number;
}

interface Library {
  readonly objectTypeCode: string;
  readonly directoryCode: string;
  readonly sortOrder: number;
  readonly recordCount: number;
}

/** Builds the read-only catalog navigation tree without loading records or fields. */
export function buildDataCatalogTree(input: {
  readonly catalog: WorkspaceDataCatalog;
  readonly objectTypes: readonly ObjectTypeDef[];
  readonly sourceId: string | null;
  readonly records?: Readonly<Record<string, DataCatalogLibraryRecords>>;
  readonly focusObjectId?: string | null;
}): DataCatalogTreeModel {
  const directories = new Map(
    input.catalog.directories.map((directory) => [directory.code, directory]),
  );
  const objectTypes = new Map(
    input.objectTypes.map((objectType) => [objectType.code, objectType]),
  );
  const directoryChildren = new Map<string, Directory[]>();
  const roots: Directory[] = [];
  const detached = new Set<string>();

  for (const directory of input.catalog.directories) {
    if (directory.parentCode && directories.has(directory.parentCode)) {
      append(directoryChildren, directory.parentCode, directory);
    } else {
      roots.push(directory);
      if (directory.parentCode) detached.add(directory.code);
    }
  }

  const librariesByDirectory = new Map<string, Library[]>();
  const unclassified: Library[] = [];
  for (const library of input.catalog.libraries) {
    if (directories.has(library.directoryCode)) {
      append(librariesByDirectory, library.directoryCode, library);
    } else {
      unclassified.push(library);
    }
  }

  const expanded = new Set<string>();
  const selectedKey =
    input.sourceId && objectTypes.has(input.sourceId)
      ? `library:${input.sourceId}`
      : null;
  const focusedLibraryKey = hasLoadedFocusedRecord(input)
    ? `library:${input.sourceId}`
    : null;
  const visited = new Set<string>();
  const buildDirectory = (
    directory: Directory,
    ancestors = new Set<string>(),
  ): DataCatalogTreeNode => {
    visited.add(directory.code);
    const nextAncestors = new Set(ancestors).add(directory.code);
    const childDirectories = sortDirectories(
      directoryChildren.get(directory.code) ?? [],
    ).map((child) =>
      nextAncestors.has(child.code)
        ? {
            key: `directory:${child.code}`,
            label: child.name,
            kind: "directory" as const,
            disabled: true,
            diagnostics: ["目录层级无法解析"],
          }
        : buildDirectory(child, nextAncestors),
    );
    const libraries = sortLibraries(
      librariesByDirectory.get(directory.code) ?? [],
    ).map((library) =>
      buildLibrary(
        library,
        objectTypes,
        input.records?.[library.objectTypeCode],
        input.focusObjectId ?? null,
      ),
    );
    if (
      selectedKey &&
      containsKey([...childDirectories, ...libraries], selectedKey)
    ) {
      expanded.add(`directory:${directory.code}`);
    }
    return {
      key: `directory:${directory.code}`,
      label: directory.name,
      kind: "directory",
      searchTerms: [directory.name, directory.code],
      children: [...childDirectories, ...libraries],
      diagnostics: detached.has(directory.code)
        ? ["目录父级不存在"]
        : undefined,
    };
  };

  const nodes = sortDirectories(roots).map((directory) =>
    buildDirectory(directory),
  );
  for (const directory of sortDirectories(input.catalog.directories)) {
    if (!visited.has(directory.code)) {
      nodes.push({
        ...buildDirectory(directory),
        diagnostics: ["目录层级无法解析"],
      });
    }
  }
  if (unclassified.length) {
    const libraries = sortLibraries(unclassified).map((library) =>
      buildLibrary(
        library,
        objectTypes,
        input.records?.[library.objectTypeCode],
        input.focusObjectId ?? null,
      ),
    );
    if (selectedKey && containsKey(libraries, selectedKey)) {
      expanded.add("diagnostic:unclassified-libraries");
    }
    nodes.push({
      key: "diagnostic:unclassified-libraries",
      label: "未归类记录库",
      kind: "diagnostic",
      diagnostics: ["记录库目录不存在"],
      children: libraries,
    });
  }

  const selectedKeys =
    selectedKey && containsKey(nodes, selectedKey) ? [selectedKey] : [];
  if (focusedLibraryKey && containsKey(nodes, focusedLibraryKey)) {
    expanded.add(focusedLibraryKey);
  }
  return { nodes, selectedKeys, expandedKeys: [...expanded] };
}

function hasLoadedFocusedRecord(input: {
  readonly sourceId: string | null;
  readonly focusObjectId?: string | null;
  readonly records?: Readonly<Record<string, DataCatalogLibraryRecords>>;
}): boolean {
  if (!input.sourceId || !input.focusObjectId) return false;
  const records = input.records?.[input.sourceId];
  return (
    records?.status === "loaded" &&
    records.items.some(
      (record) =>
        record.objectTypeCode === input.sourceId &&
        record.objectId === input.focusObjectId,
    )
  );
}

function buildLibrary(
  library: Library,
  objectTypes: ReadonlyMap<string, ObjectTypeDef>,
  records: DataCatalogLibraryRecords | undefined,
  focusObjectId: string | null,
): DataCatalogTreeNode {
  const objectType = objectTypes.get(library.objectTypeCode);
  const children =
    objectType === undefined
      ? undefined
      : buildRecordChildren(library.objectTypeCode, records, focusObjectId);
  return {
    key: `library:${library.objectTypeCode}`,
    label: objectType?.name ?? library.objectTypeCode,
    kind: "record-library",
    searchTerms: [
      objectType?.name ?? library.objectTypeCode,
      library.objectTypeCode,
    ],
    objectTypeCode: library.objectTypeCode,
    recordCount: library.recordCount,
    recordLoadStatus: records?.status ?? "unloaded",
    disabled: objectType === undefined,
    children,
    diagnostics:
      objectType === undefined ? ["记录库对象类型不存在"] : undefined,
  };
}

function buildRecordChildren(
  objectTypeCode: string,
  records: DataCatalogLibraryRecords | undefined,
  focusObjectId: string | null,
): readonly DataCatalogTreeNode[] {
  if (!records || records.status === "unloaded") {
    return [recordDiagnostic(objectTypeCode, "展开以加载记录")];
  }
  if (records.status === "loading") {
    return [recordDiagnostic(objectTypeCode, "正在加载记录")];
  }
  if (records.status === "failed") {
    return [
      {
        key: `record-action:${objectTypeCode}:retry`,
        label: records.error ?? "记录读取失败，点击重试",
        kind: "record-action",
        objectTypeCode,
        action: "retry",
      },
    ];
  }
  const nodes: DataCatalogTreeNode[] = records.items.map((record) => ({
    key: `record:${objectTypeCode}:${record.objectId}`,
    label: recordLabel(record.code, record.name),
    kind: "record",
    objectId: record.objectId,
    objectTypeCode,
    searchTerms: [record.code ?? "", record.name ?? ""],
    active:
      record.objectTypeCode === objectTypeCode &&
      record.objectId === focusObjectId,
  }));
  if (!nodes.length)
    nodes.push(recordDiagnostic(objectTypeCode, "该记录库暂无记录"));
  if (records.nextPage !== null) {
    nodes.push({
      key: `record-action:${objectTypeCode}:more:${records.nextPage}`,
      label: "加载更多记录",
      kind: "record-action",
      objectTypeCode,
      action: "load-more",
    });
  }
  return nodes;
}

function recordDiagnostic(
  objectTypeCode: string,
  label: string,
): DataCatalogTreeNode {
  return {
    key: `record-state:${objectTypeCode}:${label}`,
    label,
    kind: "diagnostic",
    disabled: true,
  };
}

function recordLabel(code: string | null, name: string | null): string {
  if (code && name) return `${code} · ${name}`;
  return name ?? code ?? "未命名记录";
}

function append<T>(map: Map<string, T[]>, key: string, value: T): void {
  const current = map.get(key) ?? [];
  map.set(key, [...current, value]);
}

function sortDirectories(directories: readonly Directory[]): Directory[] {
  return [...directories].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.code.localeCompare(right.code),
  );
}

function sortLibraries(libraries: readonly Library[]): Library[] {
  return [...libraries].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.objectTypeCode.localeCompare(right.objectTypeCode),
  );
}

function containsKey(
  nodes: readonly DataCatalogTreeNode[],
  key: string,
): boolean {
  return nodes.some(
    (node) => node.key === key || containsKey(node.children ?? [], key),
  );
}
