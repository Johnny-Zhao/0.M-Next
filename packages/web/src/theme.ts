/**
 * 亮/暗主题:在根元素切换 data-theme,偏好持久化到 ui. 前缀的本地存储(AG-102)。
 * 纯函数 + 可注入存储/根元素,便于测试。tokens.css 已备好 [data-theme="dark"]。
 */
export type Theme = "light" | "dark";

/** AG-102:视图偏好持久化键必须以 ui. 前缀。 */
export const THEME_STORAGE_KEY = "ui.theme";

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function readStoredTheme(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): Theme {
  return storage?.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function storeTheme(
  theme: Theme,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
  storage?.setItem(THEME_STORAGE_KEY, theme);
}

export function applyTheme(theme: Theme, root: HTMLElement): void {
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

export function themeLabel(theme: Theme): string {
  return theme === "dark" ? "☾ 暗色" : "☀ 亮色";
}
