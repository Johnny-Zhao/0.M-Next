import type { ObjectHistoryEntry, ObjectHistoryKind } from "@m-next/views";

/**
 * 属性栏「历史 / 版本护照」的纯展示逻辑:把后端 rm_object_history 条目
 * (kind + fieldCode + before/after + source)映射为图标/文案与来源链里程碑。
 * 无副作用,便于单测;文案组装与后端读模型解耦(读模型只存结构化字段)。
 */

export interface HistoryKindMeta {
  readonly glyph: string;
  readonly label: string;
  /** 令牌语义色名,对应 CSS 类 history-tone-<tone>。 */
  readonly tone: "ok" | "accent" | "warn" | "block" | "interface" | "muted";
}

export function historyKindMeta(kind: ObjectHistoryKind): HistoryKindMeta {
  switch (kind) {
    case "create":
      return { glyph: "＋", label: "创建", tone: "ok" };
    case "edit":
      return { glyph: "✎", label: "编辑", tone: "accent" };
    case "state":
      return { glyph: "⚑", label: "状态", tone: "warn" };
    case "archive":
      return { glyph: "⊘", label: "废止", tone: "muted" };
    case "delete":
      return { glyph: "✕", label: "删除", tone: "block" };
    case "link":
      return { glyph: "⇄", label: "关联", tone: "interface" };
    case "unlink":
      return { glyph: "⇋", label: "解除", tone: "muted" };
    default:
      return { glyph: "•", label: "变更", tone: "muted" };
  }
}

/** 标量值 → 展示字符串;null / 对象(如关系信息)回落空串,由调用方决定退化文案。 */
export function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value);
}

/** 关系类事件的 after_val 里带 relationType;取不到回落「关系」。 */
function relationName(entry: ObjectHistoryEntry): string {
  const info = entry.after as { readonly relationType?: string } | null;
  return info?.relationType ?? "关系";
}

/**
 * 单条历史的人读文案。fieldLabel 注入以复用 display-labels 的字段中文名。
 */
export function historyEntryText(
  entry: ObjectHistoryEntry,
  fieldLabel: (code: string) => string = (code) => code,
): string {
  switch (entry.kind) {
    case "create":
      if (entry.source === "import") return "从外部导入创建";
      if (entry.source === "AI") return "AI 创建";
      if (entry.source === "artifact_sync") return "工具同步创建";
      return "创建对象";
    case "edit": {
      const label = entry.fieldCode ? fieldLabel(entry.fieldCode) : "字段";
      const from = formatHistoryValue(entry.before);
      const to = formatHistoryValue(entry.after);
      return from !== "" ? `${label} ${from} → ${to}` : `${label} = ${to}`;
    }
    case "state":
      return "状态变更";
    case "archive":
      return "废止(保留历史)";
    case "delete":
      return "删除";
    case "link":
      return `关联 ${relationName(entry)}`;
    case "unlink":
      return `解除 ${relationName(entry)}`;
    default:
      return "变更";
  }
}

/**
 * 来源链里程碑:创建 / 状态迁移 / 废止 / 删除,或任何来自外部信源(导入 / AI / 工具同步)的条目。
 * 字段级 edit 属噪声,不进护照来源链。
 */
export function isProvenanceMilestone(entry: ObjectHistoryEntry): boolean {
  if (
    entry.kind === "create" ||
    entry.kind === "state" ||
    entry.kind === "archive" ||
    entry.kind === "delete"
  ) {
    return true;
  }
  return (
    entry.source === "import" ||
    entry.source === "AI" ||
    entry.source === "artifact_sync"
  );
}

/** 护照来源链:里程碑按时间正序(oldest → newest),供竖向时间线渲染。 */
export function provenanceChain(
  entries: readonly ObjectHistoryEntry[],
): readonly ObjectHistoryEntry[] {
  return entries
    .filter(isProvenanceMilestone)
    .slice()
    .sort((a, b) => a.seq - b.seq);
}
