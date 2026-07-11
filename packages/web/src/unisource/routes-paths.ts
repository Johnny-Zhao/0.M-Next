/**
 * 路由地址簿(交接规格 §01 页面地图「路由建议」;挂载于 basename=/us 之下)。
 * aichat/sim/split/tpl 为参数化状态,不是独立路由。
 */

export type UsFormKind = "grid" | "doc" | "canvas" | "matrix" | "bi" | "ana";

export const US_BASENAME = "/us";

export const usPaths = {
  home: "/home",
  source: (sourceId: string) => `/source/${sourceId}`,
  validate: "/source/validate",
  expr: (exprId: string, form?: UsFormKind) =>
    form ? `/expr/${exprId}?form=${form}` : `/expr/${exprId}`,
  import: "/import",
  plugins: "/settings/plugins",
  access: "/settings/access",
  preview: "/preview",
} as const;

/** 从 searchParams 解析描述形式;非法值回退 fallback。 */
export function parseFormParam(
  search: URLSearchParams,
  fallback: UsFormKind,
): UsFormKind {
  const raw = search.get("form");
  const valid: readonly UsFormKind[] = [
    "grid",
    "doc",
    "canvas",
    "matrix",
    "bi",
    "ana",
  ];
  return valid.includes(raw as UsFormKind) ? (raw as UsFormKind) : fallback;
}
