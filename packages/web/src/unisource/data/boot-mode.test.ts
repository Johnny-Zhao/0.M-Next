import { describe, expect, it } from "vitest";

import {
  BACKEND_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  clearBackendPreference,
  persistBootMode,
  resolveBootMode,
} from "./boot-mode";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("boot mode", () => {
  it("prefers URL backend and workspace parameters", () => {
    const storage = new MemoryStorage();
    storage.setItem(BACKEND_STORAGE_KEY, "0");
    storage.setItem(WORKSPACE_STORAGE_KEY, "stored-ws");

    expect(resolveBootMode("?backend=1&ws=url-ws", storage)).toEqual({
      backend: true,
      workspaceId: "url-ws",
      source: "url",
    });
  });

  it("falls back to ui-prefixed storage", () => {
    const storage = new MemoryStorage();
    storage.setItem(BACKEND_STORAGE_KEY, "true");
    storage.setItem(WORKSPACE_STORAGE_KEY, "stored-ws");

    expect(resolveBootMode("", storage)).toEqual({
      backend: true,
      workspaceId: "stored-ws",
      source: "storage",
    });
  });

  it("treats invalid backend flags as mock mode", () => {
    expect(resolveBootMode("?backend=maybe&ws=ws-1")).toEqual({
      backend: false,
      workspaceId: "ws-1",
      source: "url",
    });
  });

  it("persists and clears only ui backend preferences", () => {
    const storage = new MemoryStorage();

    persistBootMode(
      { backend: true, workspaceId: "ws-1", source: "url" },
      storage,
    );
    expect(storage.getItem(BACKEND_STORAGE_KEY)).toBe("1");
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBe("ws-1");

    clearBackendPreference(storage);
    expect(storage.getItem(BACKEND_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBe("ws-1");
  });
});
