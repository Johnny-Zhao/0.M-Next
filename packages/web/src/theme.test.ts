import { describe, expect, it } from "vitest";

import {
  applyTheme,
  nextTheme,
  readStoredTheme,
  storeTheme,
  themeLabel,
  THEME_STORAGE_KEY,
} from "./theme";

function fakeStorage(initial?: string): Storage {
  let value = initial;
  return {
    getItem: () => value ?? null,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    removeItem: () => {
      value = undefined;
    },
    clear: () => {
      value = undefined;
    },
    key: () => null,
    length: 0,
  } as Storage;
}

describe("theme", () => {
  it("uses a ui. prefixed storage key (AG-102)", () => {
    expect(THEME_STORAGE_KEY.startsWith("ui.")).toBe(true);
  });

  it("toggles between light and dark", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });

  it("reads stored theme, defaulting to light", () => {
    expect(readStoredTheme(fakeStorage())).toBe("light");
    expect(readStoredTheme(fakeStorage("dark"))).toBe("dark");
    expect(readStoredTheme(fakeStorage("garbage"))).toBe("light");
  });

  it("round-trips through storage", () => {
    const storage = fakeStorage();
    storeTheme("dark", storage);
    expect(readStoredTheme(storage)).toBe("dark");
  });

  it("applies the theme attribute to a root element", () => {
    const attrs = new Map<string, string>();
    const root = {
      setAttribute: (name: string, value: string) => attrs.set(name, value),
      removeAttribute: (name: string) => attrs.delete(name),
    } as unknown as HTMLElement;
    applyTheme("dark", root);
    expect(attrs.get("data-theme")).toBe("dark");
    applyTheme("light", root);
    expect(attrs.has("data-theme")).toBe(false);
  });

  it("labels the active theme", () => {
    expect(themeLabel("dark")).toContain("暗");
    expect(themeLabel("light")).toContain("亮");
  });
});
