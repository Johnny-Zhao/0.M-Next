const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTERNAL_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/i;

const TEMPLATE_LABELS: Readonly<Record<string, string>> = {
  interior_design: "室内设计",
  technical_proposal: "技术方案",
  mbse: "系统工程",
  sysml_mbse: "系统工程",
  reuse_profile: "复用装配",
};

const OBJECT_TYPE_LABELS: Readonly<Record<string, string>> = {
  proposal: "方案",
  system: "系统",
  module: "模块",
  requirement: "需求",
  interface: "接口",
  room: "房间",
  wall: "墙体",
  fixture: "设备",
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

export function objectTypeLabel(code: string | null | undefined): string {
  if (!code) return "对象";
  return OBJECT_TYPE_LABELS[code] ?? "对象";
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "未知";
  return STATUS_LABELS[status.toUpperCase()] ?? "未知";
}

export function safeVisibleText(
  value: string | null | undefined,
  fallback: string,
): string {
  const text = value?.trim() ?? "";
  if (!text || UUID_PATTERN.test(text) || INTERNAL_CODE_PATTERN.test(text)) {
    return fallback;
  }
  return text;
}
