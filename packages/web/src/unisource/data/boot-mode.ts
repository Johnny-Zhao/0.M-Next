import { useSyncExternalStore } from "react";

export const BACKEND_STORAGE_KEY = "ui.us.backend";
export const WORKSPACE_STORAGE_KEY = "ui.us.workspaceId";

export interface BootMode {
  readonly backend: boolean;
  readonly workspaceId: string | null;
  readonly source: "url" | "storage" | "default";
}

export interface KernelRuntimeState {
  readonly backend: boolean;
  readonly workspaceId: string | null;
  readonly reportLabel: string | null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Listener = () => void;

let runtimeState: KernelRuntimeState = {
  backend: false,
  workspaceId: null,
  reportLabel: null,
};
const listeners = new Set<Listener>();

export function resolveBootMode(
  search: string,
  storage?: Pick<Storage, "getItem"> | null,
): BootMode {
  const params = new URLSearchParams(
    search.startsWith("?") ? search : `?${search}`,
  );
  const backendParam = params.get("backend");
  const wsParam = clean(params.get("ws"));
  if (backendParam !== null || wsParam !== null) {
    return {
      backend: parseBackendFlag(backendParam),
      workspaceId: wsParam,
      source: "url",
    };
  }
  const storedBackend = safeGet(storage, BACKEND_STORAGE_KEY);
  const storedWorkspace = clean(safeGet(storage, WORKSPACE_STORAGE_KEY));
  if (storedBackend !== null || storedWorkspace !== null) {
    return {
      backend: parseBackendFlag(storedBackend),
      workspaceId: storedWorkspace,
      source: "storage",
    };
  }
  return { backend: false, workspaceId: null, source: "default" };
}

export function resolveBrowserBootMode(): BootMode {
  return resolveBootMode(window.location.search, browserStorage());
}

export function persistBootMode(
  mode: BootMode,
  storage?: StorageLike | null,
): void {
  if (!storage) return;
  if (mode.backend) {
    safeSet(storage, BACKEND_STORAGE_KEY, "1");
  } else {
    safeRemove(storage, BACKEND_STORAGE_KEY);
  }
  if (mode.workspaceId) {
    safeSet(storage, WORKSPACE_STORAGE_KEY, mode.workspaceId);
  } else if (!mode.backend) {
    safeRemove(storage, WORKSPACE_STORAGE_KEY);
  }
}

export function persistBrowserBootMode(mode: BootMode): void {
  persistBootMode(mode, browserStorage());
}

export function clearBackendPreference(storage?: StorageLike | null): void {
  safeRemove(storage, BACKEND_STORAGE_KEY);
}

export function clearBrowserBackendPreference(): void {
  clearBackendPreference(browserStorage());
}

export function readBrowserWorkspacePreference(): string {
  return safeGet(browserStorage(), WORKSPACE_STORAGE_KEY) ?? "";
}

export function setKernelRuntimeState(next: KernelRuntimeState): void {
  runtimeState = next;
  listeners.forEach((listener) => listener());
}

export function getKernelRuntimeState(): KernelRuntimeState {
  return runtimeState;
}

export function useKernelRuntimeState(): KernelRuntimeState {
  return useSyncExternalStore(
    subscribeRuntime,
    getKernelRuntimeState,
    getKernelRuntimeState,
  );
}

function subscribeRuntime(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function browserStorage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function parseBackendFlag(value: string | null): boolean {
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function clean(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function safeGet(
  storage: Pick<Storage, "getItem"> | undefined | null,
  key: string,
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // UI preference persistence is best effort only.
  }
}

function safeRemove(
  storage: Pick<Storage, "removeItem"> | undefined | null,
  key: string,
): void {
  try {
    storage?.removeItem(key);
  } catch {
    // UI preference persistence is best effort only.
  }
}
