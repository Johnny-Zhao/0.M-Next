import type { ViewObject } from "./api/view-client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTERNAL_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/i;

export const OBJECT_TYPE_LABELS: Readonly<Record<string, string>> = {
  proposal: "方案",
  proposal_node: "方案节点",
  system: "系统",
  module: "模块",
  interface: "接口",
  requirement: "需求",
  alternative: "比选方案",
  room: "房间",
  wall: "墙体",
  fixture: "设备",
};

export const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: "名称",
  description: "描述",
  body: "正文",
  title: "标题",
  version: "版本",
  author: "作者",
  power_budget_w: "功率预算(W)",
  responsibility: "职责",
  power_w: "功率(W)",
  direction: "方向",
  protocol: "协议",
  data: "数据",
  code: "需求编号",
  text: "需求内容",
  priority: "优先级",
  score: "评分",
  conclusion: "结论",
  total_power_fx: "总功耗(W)",
  child_count_fx: "子项数",
};

export function objectTypeLabel(code: string | null | undefined): string {
  if (!code) return "对象";
  return OBJECT_TYPE_LABELS[code] ?? "对象";
}

export function fieldLabel(code: string, backendName?: string | null): string {
  return FIELD_LABELS[code] ?? safeVisibleText(backendName, code);
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

export function shortObjectId(objectId: string | null | undefined): string {
  const text = objectId?.trim() ?? "";
  if (!text) return "000000";
  return text.replace(/-/g, "").slice(0, 6);
}

export function objectDisplayTitle(object: ViewObject): string {
  const preferred = object.fields.name ?? object.fields.title;
  const fallback = `${objectTypeLabel(object.objectType)} ${shortObjectId(
    object.objectId,
  )}`;
  return safeVisibleText(
    typeof preferred === "string" ? preferred : null,
    fallback,
  );
}
