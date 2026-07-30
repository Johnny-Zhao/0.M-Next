import { describe, expect, it } from "vitest";

import {
  buildDataCatalogTree,
  type DataCatalogTreeNode,
} from "./data-catalog-tree-model";
import { filterDataCatalogTree } from "./data-catalog-search-model";

const tree = buildDataCatalogTree({
  catalog: {
    workspaceId: "workspace-a",
    directories: [
      { code: "procurement", name: "采购", parentCode: null, sortOrder: 0 },
      { code: "plans", name: "方案", parentCode: "procurement", sortOrder: 0 },
    ],
    libraries: [
      {
        objectTypeCode: "build_plan",
        directoryCode: "plans",
        sortOrder: 0,
        recordCount: 2,
      },
      {
        objectTypeCode: "hardware_product",
        directoryCode: "procurement",
        sortOrder: 1,
        recordCount: 1,
      },
    ],
  },
  objectTypes: [
    { code: "build_plan", name: "采购方案", group: "采购", fields: [] },
    { code: "hardware_product", name: "硬件配件", group: "采购", fields: [] },
  ],
  sourceId: null,
  records: {
    build_plan: {
      status: "loaded",
      error: null,
      total: 2,
      nextPage: 1,
      items: [
        {
          objectId: "plan-std",
          objectTypeCode: "build_plan",
          code: "PLAN-STD",
          name: "标准开发方案",
          status: "active",
        },
        {
          objectId: "plan-entry",
          objectTypeCode: "build_plan",
          code: "PLAN-ENTRY",
          name: "入门方案",
          status: "active",
        },
      ],
    },
  },
});

describe("data catalog search model", () => {
  it("matches directory, library, and loaded record code or name", () => {
    expect(keys(filterDataCatalogTree(tree.nodes, "采购").nodes)).toContain(
      "directory:procurement",
    );
    expect(
      keys(filterDataCatalogTree(tree.nodes, "BUILD_PLAN").nodes),
    ).toContain("library:build_plan");
    expect(
      keys(filterDataCatalogTree(tree.nodes, " plan-std ").nodes),
    ).toContain("record:build_plan:plan-std");
    expect(keys(filterDataCatalogTree(tree.nodes, "标准开发").nodes)).toContain(
      "record:build_plan:plan-std",
    );
  });

  it("preserves directory, library, and record ancestors while expanding only the match path", () => {
    const result = filterDataCatalogTree(tree.nodes, "PLAN-STD");

    expect(result.automaticExpandedKeys).toEqual([
      "library:build_plan",
      "directory:plans",
      "directory:procurement",
    ]);
    expect(keys(result.nodes)).toEqual([
      "directory:procurement",
      "directory:plans",
      "library:build_plan",
      "record:build_plan:plan-std",
      "record-action:build_plan:more:1",
    ]);
  });

  it("keeps a matching directory's existing subtree intact", () => {
    const result = filterDataCatalogTree(tree.nodes, "方案");
    const plans = findNode(result.nodes, "directory:plans");

    expect(plans?.children?.map((node) => node.key)).toEqual([
      "library:build_plan",
    ]);
    expect(
      findNode(result.nodes, "record:build_plan:plan-entry"),
    ).toBeDefined();
  });

  it("keeps unloaded libraries visible without claiming there are no matches", () => {
    const result = filterDataCatalogTree(tree.nodes, "未加载记录的名称");

    expect(result.hasLoadedMatch).toBe(false);
    expect(result.hasUnloadedLibraries).toBe(true);
    expect(keys(result.nodes)).toContain("library:hardware_product");
    expect(result.automaticExpandedKeys).toContain("library:hardware_product");
  });

  it("returns an explicit empty result only after all record libraries are loaded", () => {
    const loaded = buildDataCatalogTree({
      catalog: {
        workspaceId: "workspace-b",
        directories: [
          { code: "root", name: "根目录", parentCode: null, sortOrder: 0 },
        ],
        libraries: [
          {
            objectTypeCode: "part",
            directoryCode: "root",
            sortOrder: 0,
            recordCount: 0,
          },
        ],
      },
      objectTypes: [{ code: "part", name: "配件", group: "采购", fields: [] }],
      sourceId: null,
      records: {
        part: {
          status: "loaded",
          error: null,
          total: 0,
          nextPage: null,
          items: [],
        },
      },
    });
    const result = filterDataCatalogTree(loaded.nodes, "不存在");

    expect(result.nodes).toEqual([]);
    expect(result.hasLoadedMatch).toBe(false);
    expect(result.hasUnloadedLibraries).toBe(false);
  });

  it("returns the complete tree without changing expansion when the query is empty", () => {
    const result = filterDataCatalogTree(tree.nodes, "   ");

    expect(result.nodes).toBe(tree.nodes);
    expect(result.automaticExpandedKeys).toEqual([]);
  });
});

function findNode(
  nodes: readonly DataCatalogTreeNode[],
  key: string,
): DataCatalogTreeNode | undefined {
  for (const node of nodes) {
    if (node.key === key) return node;
    const child = findNode(node.children ?? [], key);
    if (child) return child;
  }
  return undefined;
}

function keys(nodes: readonly DataCatalogTreeNode[]): readonly string[] {
  return nodes.flatMap((node) => [node.key, ...keys(node.children ?? [])]);
}
