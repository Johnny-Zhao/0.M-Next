import { describe, expect, it } from "vitest";

import type { WorkspaceDataCatalog } from "./gateway";
import { buildDataCatalogTree } from "./data-catalog-tree-model";

const catalog: WorkspaceDataCatalog = {
  workspaceId: "workspace-1",
  directories: [
    { code: "hardware", name: "硬件", parentCode: null, sortOrder: 20 },
    { code: "plans", name: "方案", parentCode: null, sortOrder: 10 },
    { code: "quotes", name: "报价", parentCode: "plans", sortOrder: 10 },
  ],
  libraries: [
    {
      objectTypeCode: "supplier",
      directoryCode: "quotes",
      sortOrder: 20,
      recordCount: 2,
    },
    {
      objectTypeCode: "build_plan",
      directoryCode: "plans",
      sortOrder: 20,
      recordCount: 3,
    },
    {
      objectTypeCode: "product",
      directoryCode: "hardware",
      sortOrder: 10,
      recordCount: 5,
    },
  ],
};

const objectTypes = [
  { code: "build_plan", name: "装机方案", group: "采购", fields: [] },
  { code: "supplier", name: "供应商", group: "采购", fields: [] },
  { code: "product", name: "硬件配件", group: "采购", fields: [] },
];

describe("data catalog tree model", () => {
  it("builds stable, sorted directory and record-library nodes", () => {
    const tree = buildDataCatalogTree({
      catalog,
      objectTypes,
      sourceId: "supplier",
    });

    expect(tree.nodes.map((node) => node.key)).toEqual([
      "directory:plans",
      "directory:hardware",
    ]);
    expect(tree.nodes[0]).toMatchObject({
      key: "directory:plans",
      children: [
        { key: "directory:quotes" },
        { key: "library:build_plan", label: "装机方案" },
      ],
    });
    expect(tree.selectedKeys).toEqual(["library:supplier"]);
    expect(tree.expandedKeys).toEqual(["directory:quotes", "directory:plans"]);
  });

  it("keeps malformed catalog entries visible with diagnostics", () => {
    const tree = buildDataCatalogTree({
      catalog: {
        ...catalog,
        directories: [
          ...catalog.directories,
          {
            code: "orphan",
            name: "孤立目录",
            parentCode: "missing",
            sortOrder: 30,
          },
        ],
        libraries: [
          ...catalog.libraries,
          {
            objectTypeCode: "missing_type",
            directoryCode: "plans",
            sortOrder: 30,
            recordCount: 1,
          },
          {
            objectTypeCode: "unclassified",
            directoryCode: "missing",
            sortOrder: 10,
            recordCount: 1,
          },
        ],
      },
      objectTypes,
      sourceId: "missing_type",
    });

    expect(
      tree.nodes.find((node) => node.key === "directory:orphan"),
    ).toMatchObject({
      diagnostics: ["目录父级不存在"],
    });
    expect(
      tree.nodes.find(
        (node) => node.key === "diagnostic:unclassified-libraries",
      ),
    ).toMatchObject({
      label: "未归类记录库",
      diagnostics: ["记录库目录不存在"],
      children: [{ key: "library:unclassified", disabled: true }],
    });
    expect(
      tree.nodes[0]?.children?.find(
        (node) => node.key === "library:missing_type",
      ),
    ).toMatchObject({
      label: "missing_type",
      disabled: true,
      diagnostics: ["记录库对象类型不存在"],
    });
    expect(tree.selectedKeys).toEqual([]);
  });

  it("does not select an invalid source or fabricate empty catalog nodes", () => {
    expect(
      buildDataCatalogTree({
        catalog: { workspaceId: "workspace-1", directories: [], libraries: [] },
        objectTypes,
        sourceId: "not-a-library",
      }),
    ).toEqual({ nodes: [], selectedKeys: [], expandedKeys: [] });
  });

  it("adds loaded records, paging actions, and focus without probing other pages", () => {
    const tree = buildDataCatalogTree({
      catalog,
      objectTypes,
      sourceId: "product",
      focusObjectId: "product-2",
      records: {
        product: {
          status: "loaded",
          error: null,
          total: 3,
          nextPage: 1,
          items: [
            {
              objectId: "product-1",
              objectTypeCode: "product",
              code: "P-001",
              name: "Monitor",
              status: "active",
            },
            {
              objectId: "product-2",
              objectTypeCode: "product",
              code: null,
              name: null,
              status: "active",
            },
          ],
        },
      },
    });
    const product = tree.nodes
      .find((node) => node.key === "directory:hardware")
      ?.children?.find((node) => node.key === "library:product");

    expect(product?.children).toMatchObject([
      { key: "record:product:product-1", label: "P-001 · Monitor" },
      { key: "record:product:product-2", label: "未命名记录", active: true },
      { key: "record-action:product:more:1", action: "load-more" },
    ]);
    expect(tree.selectedKeys).toEqual(["library:product"]);
    expect(tree.expandedKeys).toEqual([
      "directory:hardware",
      "library:product",
    ]);
  });

  it("keeps an unresolved focus from expanding or activating records", () => {
    const tree = buildDataCatalogTree({
      catalog,
      objectTypes,
      sourceId: "product",
      focusObjectId: "missing-object",
      records: {
        product: {
          status: "failed",
          error: "unavailable",
          total: null,
          nextPage: 0,
          items: [],
        },
      },
    });
    const product = tree.nodes
      .find((node) => node.key === "directory:hardware")
      ?.children?.find((node) => node.key === "library:product");

    expect(tree.selectedKeys).toEqual(["library:product"]);
    expect(tree.expandedKeys).toEqual(["directory:hardware"]);
    expect(product?.children).toMatchObject([
      { key: "record-action:product:retry", action: "retry" },
    ]);
  });

  it("does not expand a library for an absent focus on an otherwise loaded page", () => {
    const tree = buildDataCatalogTree({
      catalog,
      objectTypes,
      sourceId: "product",
      focusObjectId: "supplier-1",
      records: {
        product: {
          status: "loaded",
          error: null,
          total: 1,
          nextPage: null,
          items: [
            {
              objectId: "supplier-1",
              objectTypeCode: "supplier",
              code: "S-001",
              name: "Supplier",
              status: "active",
            },
          ],
        },
      },
    });
    const product = tree.nodes
      .find((node) => node.key === "directory:hardware")
      ?.children?.find((node) => node.key === "library:product");

    expect(tree.selectedKeys).toEqual(["library:product"]);
    expect(tree.expandedKeys).toEqual(["directory:hardware"]);
    expect(product?.children?.[0]).toMatchObject({ active: false });
  });

  it("does not auto-expand a record library when source routing has no focus", () => {
    const tree = buildDataCatalogTree({
      catalog,
      objectTypes,
      sourceId: "product",
      records: {
        product: {
          status: "loaded",
          error: null,
          total: 1,
          nextPage: null,
          items: [
            {
              objectId: "product-1",
              objectTypeCode: "product",
              code: "P-001",
              name: "Product",
              status: "active",
            },
          ],
        },
      },
    });

    expect(tree.expandedKeys).toEqual(["directory:hardware"]);
  });
});
