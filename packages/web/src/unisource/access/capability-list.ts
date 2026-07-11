import type { PermLevel } from "../model/kernel";

export interface CapabilityItem {
  readonly label: string;
  readonly allowed: boolean;
  readonly hint: string;
}

export function deriveCapabilities(
  level: PermLevel,
): readonly CapabilityItem[] {
  const canRead = level !== "none";
  const canWrite = level === "admin" || level === "edit" || level === "owner";
  const canAdmin = level === "admin";
  return [
    {
      label: "查看记录",
      allowed: canRead,
      hint: canRead ? "可读取该数据源" : "无访问权限",
    },
    {
      label: "在表达中引用字段",
      allowed: canRead,
      hint: canRead ? "可插入 RefChip" : "不可引用",
    },
    {
      label: "修改字段值",
      allowed: canWrite,
      hint: canWrite ? "可直接写入" : "提交后转审批",
    },
    {
      label: "管理字段结构",
      allowed: canAdmin,
      hint: canAdmin ? "可管理字段结构" : "仅管理员",
    },
    {
      label: "删除记录",
      allowed: canAdmin,
      hint: canAdmin ? "可执行高危操作" : "仅管理员",
    },
  ];
}

export function permissionLabel(level: PermLevel): string {
  const labels: Record<PermLevel, string> = {
    admin: "管理",
    edit: "编辑",
    owner: "所有者",
    readonly: "只读",
    none: "无",
  };
  return labels[level];
}
