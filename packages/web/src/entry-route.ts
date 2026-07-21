export function rootUnisourceLocation(
  pathname: string,
  search: string,
  hash: string,
): string | null {
  if (pathname !== "/") return null;
  const params = new URLSearchParams(search);
  const backend = params.get("backend")?.trim();
  const workspaceId = params.get("ws")?.trim();
  return backend === "1" && Boolean(workspaceId)
    ? `/us/home${search}${hash}`
    : null;
}

export function isWorkspaceLauncherLocation(pathname: string): boolean {
  return pathname === "/";
}

export function isUnisourceLocation(pathname: string): boolean {
  return pathname === "/us" || pathname.startsWith("/us/");
}
