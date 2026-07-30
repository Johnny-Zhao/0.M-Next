import { usPaths } from "../routes-paths";
import type { UnisourceGateway } from "../data/gateway";
import type {
  DataCatalogState,
  DataCatalogStore,
} from "../state/data-catalog-store";

export type DataCatalogSidebarTab = "what" | "data";

export interface DataCatalogSidebarSearchState {
  readonly what: string;
  readonly data: string;
}

export const EMPTY_DATA_CATALOG_SIDEBAR_SEARCH: DataCatalogSidebarSearchState =
  {
    what: "",
    data: "",
  };

export interface DataCatalogExpandedState {
  readonly manualExpandedKeys: readonly string[];
}

export const EMPTY_DATA_CATALOG_EXPANDED_STATE: DataCatalogExpandedState = {
  manualExpandedKeys: [],
};

export function updateDataCatalogSidebarSearch(
  state: DataCatalogSidebarSearchState,
  tab: DataCatalogSidebarTab,
  value: string,
): DataCatalogSidebarSearchState {
  return { ...state, [tab]: value };
}

export function resetDataCatalogSearchForWorkspace(
  state: DataCatalogSidebarSearchState,
): DataCatalogSidebarSearchState {
  return { ...state, data: "" };
}

export interface DataCatalogSidebarModel {
  readonly catalog: DataCatalogState["catalog"];
  readonly loading: boolean;
  readonly error: string | null;
  readonly records: DataCatalogState["records"];
  readonly shouldLoadCatalog: boolean;
}

/** Keeps Catalog state scoped to the active workspace and tab. */
export function resolveDataCatalogSidebar(
  tab: DataCatalogSidebarTab,
  workspaceId: string,
  state: DataCatalogState,
): DataCatalogSidebarModel {
  const isCurrentWorkspace = state.workspaceId === workspaceId;
  return {
    catalog: isCurrentWorkspace ? state.catalog : null,
    loading: isCurrentWorkspace && state.loading,
    error: isCurrentWorkspace ? state.error : null,
    records: isCurrentWorkspace ? state.records : {},
    shouldLoadCatalog: tab === "data",
  };
}

export function sourceIdFromDataCatalogPath(pathname: string): string | null {
  const match = pathname.match(/^\/source\/([^/]+)$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function mergeCatalogExpandedKeys(
  current: readonly string[],
  automatic: readonly string[],
): readonly string[] {
  return Array.from(new Set([...current, ...automatic]));
}

/**
 * Tree events report the currently visible union. Keep search and route-derived
 * expansion separate so clearing a search restores the user's own tree state.
 */
export function reconcileDataCatalogExpandedKeys(
  state: DataCatalogExpandedState,
  visibleKeys: readonly string[],
  automaticKeys: readonly string[],
): DataCatalogExpandedState {
  const visible = new Set(visibleKeys);
  const automatic = new Set(automaticKeys);
  const manualExpandedKeys = state.manualExpandedKeys.filter((key) =>
    visible.has(key),
  );

  for (const key of visibleKeys) {
    if (!automatic.has(key) && !manualExpandedKeys.includes(key)) {
      manualExpandedKeys.push(key);
    }
  }

  return { manualExpandedKeys };
}

export function resolveVisibleCatalogExpandedKeys(
  state: DataCatalogExpandedState,
  automaticKeys: readonly string[],
): readonly string[] {
  return mergeCatalogExpandedKeys(state.manualExpandedKeys, automaticKeys);
}

export function dataCatalogLibraryPath(objectTypeCode: string): string {
  return usPaths.source(objectTypeCode);
}

export function dataCatalogRecordPath(
  objectTypeCode: string,
  objectId: string,
): string {
  return `${usPaths.source(objectTypeCode)}?${new URLSearchParams({
    focus: objectId,
  })}`;
}

export function focusObjectIdFromDataCatalogSearch(
  search: string,
): string | null {
  const focus = new URLSearchParams(search).get("focus");
  return focus?.trim() || null;
}

export function loadDataCatalogForSidebar(
  shouldLoadCatalog: boolean,
  workspaceId: string,
  gateway: Pick<UnisourceGateway, "loadDataCatalog"> | null,
  store: Pick<DataCatalogStore, "load">,
  force = false,
): Promise<void> | null {
  if (!shouldLoadCatalog || !gateway) return null;
  return store.load(workspaceId, gateway, force);
}

export function loadCatalogRecordsForSidebar(
  workspaceId: string,
  objectTypeCode: string,
  gateway: Pick<UnisourceGateway, "loadDataCatalogRecords"> | null,
  store: Pick<DataCatalogStore, "ensureRecords">,
): Promise<void> | null {
  return gateway
    ? store.ensureRecords(workspaceId, objectTypeCode, gateway)
    : null;
}

export function loadMoreCatalogRecordsForSidebar(
  workspaceId: string,
  objectTypeCode: string,
  gateway: Pick<UnisourceGateway, "loadDataCatalogRecords"> | null,
  store: Pick<DataCatalogStore, "loadMoreRecords">,
): Promise<void> | null {
  return gateway
    ? store.loadMoreRecords(workspaceId, objectTypeCode, gateway)
    : null;
}

export function retryCatalogRecordsForSidebar(
  workspaceId: string,
  objectTypeCode: string,
  gateway: Pick<UnisourceGateway, "loadDataCatalogRecords"> | null,
  store: Pick<DataCatalogStore, "retryRecords">,
): Promise<void> | null {
  return gateway
    ? store.retryRecords(workspaceId, objectTypeCode, gateway)
    : null;
}
