export function rootUnisourceLocation(
  pathname: string,
  search: string,
  hash: string,
): string | null {
  if (pathname !== "/") return null;
  const params = new URLSearchParams(search);
  return params.has("backend") || params.has("ws")
    ? `/us/home${search}${hash}`
    : null;
}

export function isWorkspaceLauncherLocation(pathname: string): boolean {
  return pathname === "/";
}

export function isUnisourceLocation(pathname: string): boolean {
  return pathname === "/us" || pathname.startsWith("/us/");
}
