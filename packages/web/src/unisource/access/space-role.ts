import type { MemberId, PermissionMatrix, PermLevel } from "../model/kernel";

export type SpaceRole = "ADMIN" | "AUTHOR" | "REVIEWER" | "VIEWER";

export const SPACE_ROLE_LABEL: Record<SpaceRole, string> = {
  ADMIN: "空间管理员",
  AUTHOR: "作者",
  REVIEWER: "审阅者",
  VIEWER: "查看者",
};

export function projectSpaceRole(
  memberId: MemberId,
  permissions: PermissionMatrix,
): SpaceRole {
  const levels = Object.values(permissions[memberId] ?? {});
  if (levels.includes("admin")) return "ADMIN";
  if (levels.some(isAuthorLevel)) return "AUTHOR";
  return "VIEWER";
}

function isAuthorLevel(level: PermLevel): boolean {
  return level === "edit" || level === "owner";
}
