import { describe, expect, it, vi } from "vitest";

import type {
  DataCatalogRecordPage,
  WorkspaceDataCatalog,
} from "../data/gateway";
import { DataCatalogStore } from "./data-catalog-store";

const catalog = (workspaceId: string): WorkspaceDataCatalog => ({
  workspaceId,
  directories: [{ code: "root", name: "目录", parentCode: null, sortOrder: 0 }],
  libraries: [],
});

const records = (
  objectTypeCode: string,
  page: number,
  total: number,
  ids: readonly string[],
): DataCatalogRecordPage => ({
  objectTypeCode,
  page,
  pageSize: 50,
  total,
  items: ids.map((objectId) => ({
    objectId,
    objectTypeCode,
    code: `CODE-${objectId}`,
    name: `Record ${objectId}`,
    status: "active",
  })),
});

describe("DataCatalogStore", () => {
  it("deduplicates concurrent reads for one workspace", async () => {
    let resolveCatalog: (value: WorkspaceDataCatalog) => void = () => undefined;
    const gateway = {
      loadDataCatalog: vi.fn(
        () =>
          new Promise<WorkspaceDataCatalog>(
            (resolve) => (resolveCatalog = resolve),
          ),
      ),
    };
    const store = new DataCatalogStore();

    const first = store.load("workspace-1", gateway);
    const second = store.load("workspace-1", gateway);
    expect(gateway.loadDataCatalog).toHaveBeenCalledTimes(1);

    resolveCatalog(catalog("workspace-1"));
    await Promise.all([first, second]);
    expect(store.getSnapshot()).toMatchObject({
      workspaceId: "workspace-1",
      catalog: { workspaceId: "workspace-1" },
      loading: false,
    });
  });

  it("clears stale catalog state when the workspace changes", async () => {
    let resolveCatalog: (value: WorkspaceDataCatalog) => void = () => undefined;
    const gateway = {
      loadDataCatalog: vi.fn(
        () =>
          new Promise<WorkspaceDataCatalog>(
            (resolve) => (resolveCatalog = resolve),
          ),
      ),
    };
    const store = new DataCatalogStore();

    const first = store.load("workspace-1", gateway);
    store.activate("workspace-2");
    resolveCatalog(catalog("workspace-1"));
    await first;

    expect(store.getSnapshot()).toEqual({
      workspaceId: "workspace-2",
      catalog: null,
      loading: false,
      error: null,
      records: {},
    });
  });

  it("keeps the error visible and retries only the catalog read", async () => {
    const gateway = {
      loadDataCatalog: vi
        .fn<() => Promise<WorkspaceDataCatalog>>()
        .mockRejectedValueOnce(new Error("服务不可用"))
        .mockResolvedValueOnce(catalog("workspace-1")),
    };
    const store = new DataCatalogStore();

    await store.load("workspace-1", gateway);
    expect(store.getSnapshot().error).toBe("服务不可用");
    await store.load("workspace-1", gateway, true);

    expect(gateway.loadDataCatalog).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toMatchObject({
      catalog: { workspaceId: "workspace-1" },
      error: null,
    });
  });

  it("loads one record library on demand, then appends the next page once", async () => {
    const firstPage = Array.from(
      { length: 50 },
      (_, index) => `record-${index}`,
    );
    const gateway = {
      loadDataCatalogRecords: vi
        .fn<() => Promise<DataCatalogRecordPage>>()
        .mockResolvedValueOnce(records("product", 0, 51, firstPage))
        .mockResolvedValueOnce(
          records("product", 1, 51, ["record-49", "record-50"]),
        ),
    };
    const store = new DataCatalogStore();

    expect(gateway.loadDataCatalogRecords).not.toHaveBeenCalled();
    await Promise.all([
      store.ensureRecords("workspace-1", "product", gateway),
      store.ensureRecords("workspace-1", "product", gateway),
    ]);

    expect(gateway.loadDataCatalogRecords).toHaveBeenCalledTimes(1);
    expect(gateway.loadDataCatalogRecords).toHaveBeenLastCalledWith(
      "product",
      0,
      50,
    );
    await store.loadMoreRecords("workspace-1", "product", gateway);
    expect(gateway.loadDataCatalogRecords).toHaveBeenLastCalledWith(
      "product",
      1,
      50,
    );
    expect(store.getSnapshot().records.product).toMatchObject({
      status: "loaded",
      nextPage: null,
    });
    expect(store.getSnapshot().records.product?.items).toHaveLength(51);
    expect(store.getSnapshot().records.product?.items.at(-1)?.objectId).toBe(
      "record-50",
    );
  });

  it("keeps a failed library isolated and retries only its failed page", async () => {
    const gateway = {
      loadDataCatalogRecords: vi
        .fn<() => Promise<DataCatalogRecordPage>>()
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValueOnce(records("product", 0, 1, ["one"])),
    };
    const store = new DataCatalogStore();

    await store.ensureRecords("workspace-1", "product", gateway);
    expect(store.getSnapshot().records.product).toMatchObject({
      status: "failed",
      nextPage: 0,
      error: "unavailable",
    });
    await store.retryRecords("workspace-1", "product", gateway);

    expect(gateway.loadDataCatalogRecords).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().records.product).toMatchObject({
      status: "loaded",
      nextPage: null,
    });
  });

  it("clears record pages when the active workspace changes", async () => {
    const gateway = {
      loadDataCatalogRecords: vi.fn(() =>
        Promise.resolve(records("product", 0, 1, ["one"])),
      ),
    };
    const store = new DataCatalogStore();

    await store.ensureRecords("workspace-1", "product", gateway);
    store.activate("workspace-2");

    expect(store.getSnapshot()).toMatchObject({
      workspaceId: "workspace-2",
      records: {},
    });
  });
});
