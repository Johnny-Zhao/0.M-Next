import { useSyncExternalStore } from "react";

import type {
  DataCatalogRecord,
  UnisourceGateway,
  WorkspaceDataCatalog,
} from "../data/gateway";

export const DATA_CATALOG_RECORD_PAGE_SIZE = 50;

export type DataCatalogRecordLoadStatus =
  | "unloaded"
  | "loading"
  | "loaded"
  | "failed";

export interface DataCatalogLibraryRecords {
  readonly items: readonly DataCatalogRecord[];
  readonly nextPage: number | null;
  readonly total: number | null;
  readonly status: DataCatalogRecordLoadStatus;
  readonly error: string | null;
}

export interface DataCatalogState {
  readonly workspaceId: string | null;
  readonly catalog: WorkspaceDataCatalog | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly records: Readonly<Record<string, DataCatalogLibraryRecords>>;
}

const EMPTY_STATE: DataCatalogState = {
  workspaceId: null,
  catalog: null,
  loading: false,
  error: null,
  records: {},
};

export class DataCatalogStore {
  private state: DataCatalogState = EMPTY_STATE;
  private readonly listeners = new Set<() => void>();
  private inFlight: {
    readonly workspaceId: string;
    readonly promise: Promise<void>;
  } | null = null;
  private readonly recordFlights = new Map<string, Promise<void>>();

  getSnapshot = (): DataCatalogState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  clear(): void {
    this.inFlight = null;
    this.recordFlights.clear();
    this.update(EMPTY_STATE);
  }

  activate(workspaceId: string): void {
    if (this.state.workspaceId === workspaceId) return;
    this.inFlight = null;
    this.recordFlights.clear();
    this.update({ ...EMPTY_STATE, workspaceId });
  }

  load(
    workspaceId: string,
    gateway: Pick<UnisourceGateway, "loadDataCatalog">,
    force = false,
  ): Promise<void> {
    this.activate(workspaceId);
    if (this.inFlight?.workspaceId === workspaceId)
      return this.inFlight.promise;
    if (!force && this.state.catalog) return Promise.resolve();
    const promise = this.loadCurrentWorkspace(workspaceId, gateway);
    this.inFlight = { workspaceId, promise };
    void promise.finally(() => {
      if (this.inFlight?.promise === promise) this.inFlight = null;
    });
    return promise;
  }

  private async loadCurrentWorkspace(
    workspaceId: string,
    gateway: Pick<UnisourceGateway, "loadDataCatalog">,
  ): Promise<void> {
    this.update({ ...this.state, loading: true, error: null });
    try {
      const catalog = await gateway.loadDataCatalog();
      if (this.state.workspaceId !== workspaceId) return;
      if (catalog.workspaceId !== workspaceId) {
        throw new Error("数据目录与当前工作空间不一致");
      }
      this.update({
        workspaceId,
        catalog,
        loading: false,
        error: null,
        records: this.state.records,
      });
    } catch (error) {
      if (this.state.workspaceId === workspaceId) {
        this.update({ ...this.state, loading: false, error: message(error) });
      }
    }
  }

  ensureRecords(
    workspaceId: string,
    objectTypeCode: string,
    gateway: Pick<UnisourceGateway, "loadDataCatalogRecords">,
  ): Promise<void> {
    this.activate(workspaceId);
    const current = this.state.records[objectTypeCode];
    if (current?.status === "loading") {
      return (
        this.recordFlights.get(recordFlightKey(workspaceId, objectTypeCode)) ??
        Promise.resolve()
      );
    }
    if (current) return Promise.resolve();
    return this.loadRecordPage(workspaceId, objectTypeCode, 0, gateway);
  }

  loadMoreRecords(
    workspaceId: string,
    objectTypeCode: string,
    gateway: Pick<UnisourceGateway, "loadDataCatalogRecords">,
  ): Promise<void> {
    const current = this.state.records[objectTypeCode];
    if (
      this.state.workspaceId !== workspaceId ||
      current?.status !== "loaded"
    ) {
      return Promise.resolve();
    }
    if (current.nextPage === null) return Promise.resolve();
    return this.loadRecordPage(
      workspaceId,
      objectTypeCode,
      current.nextPage,
      gateway,
    );
  }

  retryRecords(
    workspaceId: string,
    objectTypeCode: string,
    gateway: Pick<UnisourceGateway, "loadDataCatalogRecords">,
  ): Promise<void> {
    const current = this.state.records[objectTypeCode];
    if (
      this.state.workspaceId !== workspaceId ||
      current?.status !== "failed"
    ) {
      return Promise.resolve();
    }
    return this.loadRecordPage(
      workspaceId,
      objectTypeCode,
      current.nextPage ?? 0,
      gateway,
    );
  }

  private loadRecordPage(
    workspaceId: string,
    objectTypeCode: string,
    page: number,
    gateway: Pick<UnisourceGateway, "loadDataCatalogRecords">,
  ): Promise<void> {
    const key = recordFlightKey(workspaceId, objectTypeCode);
    const active = this.recordFlights.get(key);
    if (active) return active;
    const current = this.state.records[objectTypeCode];
    this.update({
      ...this.state,
      records: {
        ...this.state.records,
        [objectTypeCode]: {
          items: current?.items ?? [],
          nextPage: page,
          total: current?.total ?? null,
          status: "loading",
          error: null,
        },
      },
    });
    const promise = this.readRecordPage(
      workspaceId,
      objectTypeCode,
      page,
      gateway,
    );
    this.recordFlights.set(key, promise);
    void promise.finally(() => {
      if (this.recordFlights.get(key) === promise)
        this.recordFlights.delete(key);
    });
    return promise;
  }

  private async readRecordPage(
    workspaceId: string,
    objectTypeCode: string,
    page: number,
    gateway: Pick<UnisourceGateway, "loadDataCatalogRecords">,
  ): Promise<void> {
    try {
      const result = await gateway.loadDataCatalogRecords(
        objectTypeCode,
        page,
        DATA_CATALOG_RECORD_PAGE_SIZE,
      );
      if (result.objectTypeCode !== objectTypeCode || result.page !== page) {
        throw new Error("记录库分页结果与请求不一致");
      }
      if (this.state.workspaceId !== workspaceId) return;
      const current = this.state.records[objectTypeCode];
      const items = mergeRecords(current?.items ?? [], result.items);
      const nextPage =
        result.items.length === 0 ||
        (result.page + 1) * result.pageSize >= result.total
          ? null
          : result.page + 1;
      this.update({
        ...this.state,
        records: {
          ...this.state.records,
          [objectTypeCode]: {
            items,
            nextPage,
            total: result.total,
            status: "loaded",
            error: null,
          },
        },
      });
    } catch (error) {
      if (this.state.workspaceId !== workspaceId) return;
      const current = this.state.records[objectTypeCode];
      this.update({
        ...this.state,
        records: {
          ...this.state.records,
          [objectTypeCode]: {
            items: current?.items ?? [],
            nextPage: page,
            total: current?.total ?? null,
            status: "failed",
            error: message(error),
          },
        },
      });
    }
  }

  private update(next: DataCatalogState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}

function recordFlightKey(workspaceId: string, objectTypeCode: string): string {
  return `${workspaceId}:${objectTypeCode}`;
}

function mergeRecords(
  existing: readonly DataCatalogRecord[],
  incoming: readonly DataCatalogRecord[],
): readonly DataCatalogRecord[] {
  const records = new Map(existing.map((record) => [record.objectId, record]));
  incoming.forEach((record) => records.set(record.objectId, record));
  return [...records.values()];
}

export const dataCatalogStore = new DataCatalogStore();

export function useDataCatalogSnapshot(): DataCatalogState {
  return useSyncExternalStore(
    dataCatalogStore.subscribe,
    dataCatalogStore.getSnapshot,
    dataCatalogStore.getSnapshot,
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "数据目录读取失败";
}
