import { type Editor, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useState, type ReactElement } from "react";

import {
  bodyExtensions,
  EMPTY_BODY_DOC,
  parseBody,
  serializeBody,
} from "./body-content";

export interface DocumentBodyBlockProps {
  readonly value: unknown;
  readonly editable: boolean;
  /** 保存正文:序列化后的 JSON 字符串走 updateSingleField 唯一出口(string 类型)。 */
  readonly onSave: (json: string) => void | Promise<void>;
  readonly showToolbar?: boolean;
}

/**
 * 文档视图的「正文」内容块:展示态渲染 body(只读 Tiptap),点击进入编辑(子集:段落/加粗/斜体/
 * 无序列表)。空态显示占位;坏 JSON 降级只读纯文本 + 提示。仅在文档视图使用。
 */
export function DocumentBodyBlock(props: DocumentBodyBlockProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const content = parseBody(props.value);

  if (editing && props.editable) {
    const initial = content.kind === "doc" ? content.doc : EMPTY_BODY_DOC;
    return (
      <section aria-label="正文" className="document-body">
        <span className="document-body-label">正文</span>
        <BodyEditorForm
          initialDoc={initial}
          onCancel={() => setEditing(false)}
          onSave={(json) => props.onSave(json)}
        />
      </section>
    );
  }

  return (
    <section aria-label="正文" className="document-body">
      <span className="document-body-label">正文</span>
      {props.showToolbar && content.kind !== "doc" ? (
        <DocumentBodyToolbar editor={null} disabled />
      ) : null}
      {content.kind === "invalid" ? (
        <div className="document-body-invalid">
          <p className="document-body-hint">
            正文数据无法解析,已降级为只读文本。
          </p>
          <pre className="document-body-raw">{content.text}</pre>
        </div>
      ) : content.kind === "empty" ? (
        props.editable ? (
          <button
            className="document-body-placeholder"
            onClick={() => setEditing(true)}
            type="button"
          >
            点击撰写正文…
          </button>
        ) : (
          <p className="document-body-empty">（暂无正文）</p>
        )
      ) : (
        <BodyReadonly
          doc={content.doc}
          onEdit={props.editable ? () => setEditing(true) : undefined}
          showToolbar={props.showToolbar}
        />
      )}
    </section>
  );
}

export type DocumentBodyToolbarCommand = "bold" | "italic" | "bulletList";

export function runDocumentBodyToolbarCommand(
  editor: Editor,
  command: DocumentBodyToolbarCommand,
): boolean {
  const chain = editor.chain();
  if (command === "bold") return chain.toggleBold().run();
  if (command === "italic") return chain.toggleItalic().run();
  return chain.toggleBulletList().run();
}

export function DocumentBodyToolbar({
  editor,
  disabled = false,
}: {
  readonly editor: Editor | null;
  readonly disabled?: boolean;
}): ReactElement {
  const unavailable = disabled || !editor;
  return (
    <div aria-label="正文格式" className="document-body-toolbar" role="toolbar">
      <span className="document-body-toolbar-label">正文</span>
      <button
        aria-label="加粗"
        aria-pressed={editor?.isActive("bold") ?? false}
        className={editor?.isActive("bold") ? "is-active" : ""}
        disabled={unavailable}
        onClick={() => editor && runDocumentBodyToolbarCommand(editor, "bold")}
        type="button"
      >
        B
      </button>
      <button
        aria-label="斜体"
        aria-pressed={editor?.isActive("italic") ?? false}
        className={editor?.isActive("italic") ? "is-active" : ""}
        disabled={unavailable}
        onClick={() =>
          editor && runDocumentBodyToolbarCommand(editor, "italic")
        }
        type="button"
      >
        I
      </button>
      <button
        aria-label="无序列表"
        aria-pressed={editor?.isActive("bulletList") ?? false}
        className={editor?.isActive("bulletList") ? "is-active" : ""}
        disabled={unavailable}
        onClick={() =>
          editor && runDocumentBodyToolbarCommand(editor, "bulletList")
        }
        type="button"
      >
        • 列表
      </button>
    </div>
  );
}

function BodyReadonly(props: {
  readonly doc: JSONContent;
  readonly onEdit?: () => void;
  readonly showToolbar?: boolean;
}): ReactElement {
  const editor = useEditor(
    { extensions: bodyExtensions(), content: props.doc, editable: false },
    [props.doc],
  );
  return (
    <div className="document-body-view">
      {props.showToolbar ? (
        <DocumentBodyToolbar editor={editor} disabled />
      ) : null}
      <EditorContent className="document-body-rendered" editor={editor} />
      {props.onEdit ? (
        <button
          className="document-body-edit"
          onClick={props.onEdit}
          type="button"
        >
          编辑正文
        </button>
      ) : null}
    </div>
  );
}

function BodyEditorForm(props: {
  readonly initialDoc: JSONContent;
  readonly onSave: (json: string) => void | Promise<void>;
  readonly onCancel: () => void;
}): ReactElement {
  const [, setTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bump = () => setTick((tick) => tick + 1);
  const editor = useEditor({
    extensions: bodyExtensions(),
    content: props.initialDoc,
    autofocus: "end",
    editable: true,
    onSelectionUpdate: bump,
    onUpdate: bump,
  });

  if (!editor) return <div className="document-body-editor" />;

  return (
    <div className="document-body-editor">
      <DocumentBodyToolbar editor={editor} />
      <EditorContent className="document-body-input" editor={editor} />
      <div className="document-body-actions">
        <button
          className="document-body-save"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            setError(null);
            void Promise.resolve(props.onSave(serializeBody(editor.getJSON())))
              .then(() => setEditingAfterSave())
              .catch((cause: unknown) => {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "正文保存失败，请稍后重试",
                );
              })
              .finally(() => setSaving(false));
          }}
          type="button"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <button disabled={saving} onClick={props.onCancel} type="button">
          取消
        </button>
      </div>
      {error ? (
        <p className="document-body-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  function setEditingAfterSave(): void {
    props.onCancel();
  }
}
