export function rootUnisourceLocation(
  pathname: string,
  search: string,
  hash: string,
): string | null {
  return pathname === "/" ? `/us/home${search}${hash}` : null;
}

export function isUnisourceLocation(pathname: string): boolean {
  return pathname === "/us" || pathname.startsWith("/us/");
}
