export {
  FIELD_LABELS,
  OBJECT_TYPE_LABELS,
  fieldLabel,
  objectDisplayTitle,
  objectTypeLabel,
  safeVisibleText,
  shortObjectId,
} from "@m-next/views";

const TEMPLATE_LABELS: Readonly<Record<string, string>> = {
  interior_design: "室内设计",
  technical_proposal: "技术方案",
  mbse: "系统工程",
  sysml_mbse: "系统工程",
  reuse_profile: "复用装配",
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: "正常",
  DRAFT: "草稿",
  CONFIRMED: "已确认",
  FILED: "已归档",
  ARCHIVED: "已归档",
  VOID: "已作废",
  DELETED: "已删除",
  UNLINKED: "已断开",
  PROPOSED: "待确认",
  REJECTED: "已拒绝",
  RESOLVED: "已解决",
  OPEN: "开放",
};

export function templateLabel(code: string | null | undefined): string {
  if (!code) return "未绑定模板";
  return TEMPLATE_LABELS[code] ?? "领域模板";
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "未知";
  return STATUS_LABELS[status.toUpperCase()] ?? "未知";
}
