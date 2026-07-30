import { describe, expect, it, vi } from "vitest";

import { buildDataCatalogTree } from "../data/data-catalog-tree-model";
import type { WorkspaceDataCatalog } from "../data/gateway";
import {
  DataCatalogStore,
  type DataCatalogState,
} from "../state/data-catalog-store";
import {
  dataCatalogLibraryPath,
  dataCatalogRecordPath,
  EMPTY_DATA_CATALOG_EXPANDED_STATE,
  EMPTY_DATA_CATALOG_SIDEBAR_SEARCH,
  focusObjectIdFromDataCatalogSearch,
  loadCatalogRecordsForSidebar,
  loadDataCatalogForSidebar,
  loadMoreCatalogRecordsForSidebar,
  mergeCatalogExpandedKeys,
  reconcileDataCatalogExpandedKeys,
  resolveDataCatalogSidebar,
  resolveVisibleCatalogExpandedKeys,
  resetDataCatalogSearchForWorkspace,
  sourceIdFromDataCatalogPath,
  updateDataCatalogSidebarSearch,
} from "./data-catalog-sidebar-model";

const catalog: WorkspaceDataCatalog = {
  workspaceId: "workspace-a",
  directories: [
    { code: "plans", name: "方案", parentCode: null, sortOrder: 0 },
    { code: "details", name: "明细", parentCode: "plans", sortOrder: 0 },
  ],
  libraries: [
    {
      objectTypeCode: "build_plan",
      directoryCode: "details",
      sortOrder: 0,
      recordCount: 2,
    },
  ],
};

const catalogState: DataCatalogState = {
  workspaceId: "workspace-a",
  catalog,
  loading: false,
  error: null,
  records: {},
};

describe("AppSidebar data catalog coordination", () => {
  it("keeps WHAT from scheduling a catalog load while retaining its current catalog state", () => {
    const sidebar = resolveDataCatalogSidebar(
      "what",
      "workspace-a",
      catalogState,
    );
    const gateway = { loadDataCatalog: vi.fn() };

    expect(sidebar.shouldLoadCatalog).toBe(false);
    expect(sidebar.catalog).toBe(catalog);
    expect(
      loadDataCatalogForSidebar(
        sidebar.shouldLoadCatalog,
        "workspace-a",
        gateway,
        new DataCatalogStore(),
      ),
    ).toBeNull();
    expect(gateway.loadDataCatalog).not.toHaveBeenCalled();
  });

  it("schedules only DATA and keeps its workspace-scoped state", () => {
    const sidebar = resolveDataCatalogSidebar(
      "data",
      "workspace-a",
      catalogState,
    );

    expect(sidebar.shouldLoadCatalog).toBe(true);
    expect(sidebar.catalog?.workspaceId).toBe("workspace-a");
  });

  it("deduplicates repeated DATA activation for the current workspace", async () => {
    const store = new DataCatalogStore();
    const gateway = { loadDataCatalog: vi.fn().mockResolvedValue(catalog) };
    const sidebar = resolveDataCatalogSidebar("data", "workspace-a", {
      workspaceId: null,
      catalog: null,
      loading: false,
      error: null,
      records: {},
    });

    const first = loadDataCatalogForSidebar(
      sidebar.shouldLoadCatalog,
      "workspace-a",
      gateway,
      store,
    );
    const second = loadDataCatalogForSidebar(
      sidebar.shouldLoadCatalog,
      "workspace-a",
      gateway,
      store,
    );
    await Promise.all([first, second]);

    expect(gateway.loadDataCatalog).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().catalog?.workspaceId).toBe("workspace-a");
  });

  it("drops catalog, loading, and error state from the previous workspace", () => {
    const sidebar = resolveDataCatalogSidebar("data", "workspace-b", {
      ...catalogState,
      loading: true,
      error: "服务不可用",
    });

    expect(sidebar).toMatchObject({
      catalog: null,
      loading: false,
      error: null,
      shouldLoadCatalog: true,
    });
  });

  it("maps a record library to the existing source route", () => {
    expect(dataCatalogLibraryPath("build_plan")).toBe("/source/build_plan");
  });

  it("maps a record to the source focus route without a write operation", () => {
    expect(dataCatalogRecordPath("build_plan", "plan A/1")).toBe(
      "/source/build_plan?focus=plan+A%2F1",
    );
    expect(focusObjectIdFromDataCatalogSearch("?focus=plan+A%2F1")).toBe(
      "plan A/1",
    );
  });

  it("does not schedule record reads before a record library opens", async () => {
    const gateway = { loadDataCatalogRecords: vi.fn() };
    const store = new DataCatalogStore();

    expect(gateway.loadDataCatalogRecords).not.toHaveBeenCalled();
    const request = loadCatalogRecordsForSidebar(
      "workspace-a",
      "build_plan",
      gateway,
      store,
    );
    await request;

    expect(gateway.loadDataCatalogRecords).toHaveBeenCalledWith(
      "build_plan",
      0,
      50,
    );
  });

  it("loads more only after the current record page has a next page", async () => {
    const gateway = {
      loadDataCatalogRecords: vi.fn().mockResolvedValue({
        objectTypeCode: "build_plan",
        page: 0,
        pageSize: 50,
        total: 51,
        items: [],
      }),
    };
    const store = new DataCatalogStore();

    await loadCatalogRecordsForSidebar(
      "workspace-a",
      "build_plan",
      gateway,
      store,
    );
    await loadMoreCatalogRecordsForSidebar(
      "workspace-a",
      "build_plan",
      gateway,
      store,
    );

    expect(gateway.loadDataCatalogRecords).toHaveBeenCalledTimes(1);
  });

  it("selects a legal source and expands its directory ancestors", () => {
    const sourceId = sourceIdFromDataCatalogPath("/source/build_plan");
    const tree = buildDataCatalogTree({
      catalog,
      sourceId,
      objectTypes: [
        { code: "build_plan", name: "采购方案", group: "采购", fields: [] },
      ],
    });

    expect(tree.selectedKeys).toEqual(["library:build_plan"]);
    expect(tree.expandedKeys).toEqual(["directory:details", "directory:plans"]);
  });

  it("does not select an invalid source and preserves manual expansion", () => {
    const tree = buildDataCatalogTree({
      catalog,
      sourceId: sourceIdFromDataCatalogPath("/source/missing"),
      objectTypes: [
        { code: "build_plan", name: "采购方案", group: "采购", fields: [] },
      ],
    });

    expect(tree.selectedKeys).toEqual([]);
    expect(
      mergeCatalogExpandedKeys(["directory:manual"], tree.expandedKeys),
    ).toEqual(["directory:manual"]);
    expect(sourceIdFromDataCatalogPath("/source/%")).toBeNull();
  });

  it("keeps WHAT and DATA search state separate and clears DATA on workspace change", () => {
    const withWhat = updateDataCatalogSidebarSearch(
      EMPTY_DATA_CATALOG_SIDEBAR_SEARCH,
      "what",
      "方案说明书",
    );
    const withData = updateDataCatalogSidebarSearch(
      withWhat,
      "data",
      "PLAN-STD",
    );

    expect(withData).toEqual({ what: "方案说明书", data: "PLAN-STD" });
    expect(resetDataCatalogSearchForWorkspace(withData)).toEqual({
      what: "方案说明书",
      data: "",
    });
  });

  it("restores only the manual expansion after clearing search-derived paths", () => {
    const state = {
      ...EMPTY_DATA_CATALOG_EXPANDED_STATE,
      manualExpandedKeys: ["directory:manual"],
    };

    expect(
      resolveVisibleCatalogExpandedKeys(state, ["directory:search-path"]),
    ).toEqual(["directory:manual", "directory:search-path"]);
    expect(resolveVisibleCatalogExpandedKeys(state, [])).toEqual([
      "directory:manual",
    ]);
  });

  it("keeps user expansion and collapse choices separate from automatic keys", () => {
    const expanded = reconcileDataCatalogExpandedKeys(
      {
        ...EMPTY_DATA_CATALOG_EXPANDED_STATE,
        manualExpandedKeys: ["directory:manual"],
      },
      ["directory:manual", "directory:search", "directory:new-manual"],
      ["directory:search"],
    );
    const collapsed = reconcileDataCatalogExpandedKeys(
      {
        ...EMPTY_DATA_CATALOG_EXPANDED_STATE,
        manualExpandedKeys: ["directory:manual"],
      },
      ["directory:search"],
      ["directory:manual", "directory:search"],
    );

    expect(expanded.manualExpandedKeys).toEqual([
      "directory:manual",
      "directory:new-manual",
    ]);
    expect(resolveVisibleCatalogExpandedKeys(expanded, [])).toEqual([
      "directory:manual",
      "directory:new-manual",
    ]);
    expect(collapsed.manualExpandedKeys).toEqual([]);
    expect(
      resolveVisibleCatalogExpandedKeys(collapsed, [
        "directory:manual",
        "directory:search",
      ]),
    ).toEqual(["directory:manual", "directory:search"]);
    expect(resolveVisibleCatalogExpandedKeys(collapsed, [])).toEqual([]);
  });

  it("retains a manual key that also appears in an automatic search path", () => {
    const state = reconcileDataCatalogExpandedKeys(
      {
        ...EMPTY_DATA_CATALOG_EXPANDED_STATE,
        manualExpandedKeys: ["directory:shared"],
      },
      ["directory:shared", "library:plans", "directory:manual"],
      ["directory:shared", "library:plans"],
    );

    expect(state.manualExpandedKeys).toEqual([
      "directory:shared",
      "directory:manual",
    ]);
    expect(resolveVisibleCatalogExpandedKeys(state, [])).toEqual([
      "directory:shared",
      "directory:manual",
    ]);
  });

  it("does not leak automatic keys across search input changes", () => {
    const state = {
      ...EMPTY_DATA_CATALOG_EXPANDED_STATE,
      manualExpandedKeys: ["directory:manual"],
    };

    expect(
      resolveVisibleCatalogExpandedKeys(state, ["directory:previous-search"]),
    ).toEqual(["directory:manual", "directory:previous-search"]);
    expect(
      resolveVisibleCatalogExpandedKeys(state, ["directory:next-search"]),
    ).toEqual(["directory:manual", "directory:next-search"]);
    expect(resolveVisibleCatalogExpandedKeys(state, [])).toEqual([
      "directory:manual",
    ]);
  });

  it("keeps DATA search input local without scheduling catalog reads or writes", () => {
    const catalogGateway = {
      loadDataCatalog: vi.fn(),
      loadDataCatalogRecords: vi.fn(),
    };
    const commandEndpoint = vi.fn();
    let search = EMPTY_DATA_CATALOG_SIDEBAR_SEARCH;

    search = updateDataCatalogSidebarSearch(search, "data", "PLAN");
    search = updateDataCatalogSidebarSearch(search, "data", "PLAN-STD");
    search = updateDataCatalogSidebarSearch(search, "data", "");

    expect(search.data).toBe("");
    expect(catalogGateway.loadDataCatalog).not.toHaveBeenCalled();
    expect(catalogGateway.loadDataCatalogRecords).not.toHaveBeenCalled();
    expect(commandEndpoint).not.toHaveBeenCalled();
  });
});
