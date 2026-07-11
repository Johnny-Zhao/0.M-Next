/** 极简 className 组合器(仓库无 clsx 依赖)。 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
