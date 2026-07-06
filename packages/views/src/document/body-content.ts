import { type Extensions, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

/**
 * 文档正文富文本编辑子集(ADR-011 编辑能力子集):段落 / 加粗 / 斜体 / 无序列表。
 *
 * 用 StarterKit 关掉标题及其它扩展 —— 生成的 schema 只认这几种节点/标记,因此子集外内容
 * (标题、代码、引用、有序列表、删除线、下划线、链接等)在粘贴时被 ProseMirror 依 schema 自动
 * 过滤。红线:禁止在此新增扩展(尤其标题),新增会破坏"子集外内容被过滤"的保证。
 */
export function bodyExtensions(): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      orderedList: false,
      hardBreak: false,
      code: false,
      strike: false,
      underline: false,
      link: false,
    }),
  ];
}

/** 空正文文档(单个空段落),供新建/占位。 */
export const EMPTY_BODY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type BodyContent =
  | { readonly kind: "empty" }
  | { readonly kind: "doc"; readonly doc: JSONContent }
  | { readonly kind: "invalid"; readonly text: string };

/**
 * 解析 body 字段值(读模型里存为 JSON 字符串):
 *  - 空 / 只有空段落 → empty(展示占位「点击撰写正文…」);
 *  - 合法 Tiptap doc 且有文本 → doc(渲染 / 可编辑);
 *  - 坏 JSON 或非 doc → invalid(降级为只读纯文本 + 提示)。
 */
export function parseBody(raw: unknown): BodyContent {
  if (typeof raw !== "string" || raw.trim() === "") return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid", text: raw };
  }
  if (!isDocNode(parsed)) return { kind: "invalid", text: raw };
  return docHasText(parsed) ? { kind: "doc", doc: parsed } : { kind: "empty" };
}

/** 编辑器 JSON → 存储字符串(body 的唯一序列化出口)。 */
export function serializeBody(doc: JSONContent): string {
  return JSON.stringify(doc);
}

function isDocNode(value: unknown): value is JSONContent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc"
  );
}

/** 文档是否含任何非空文本(判空,决定是否显示占位)。 */
function docHasText(node: JSONContent): boolean {
  if (typeof node.text === "string" && node.text.trim() !== "") return true;
  return Array.isArray(node.content) && node.content.some(docHasText);
}
