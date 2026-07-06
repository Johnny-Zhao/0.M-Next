import { type JSONContent } from "@tiptap/core";
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
  readonly onSave: (json: string) => void;
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
          onSave={(json) => {
            props.onSave(json);
            setEditing(false);
          }}
        />
      </section>
    );
  }

  return (
    <section aria-label="正文" className="document-body">
      <span className="document-body-label">正文</span>
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
        />
      )}
    </section>
  );
}

function BodyReadonly(props: {
  readonly doc: JSONContent;
  readonly onEdit?: () => void;
}): ReactElement {
  const editor = useEditor(
    { extensions: bodyExtensions(), content: props.doc, editable: false },
    [props.doc],
  );
  return (
    <div className="document-body-view">
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
  readonly onSave: (json: string) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const [, setTick] = useState(0);
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
      <div
        aria-label="正文格式"
        className="document-body-toolbar"
        role="toolbar"
      >
        <button
          aria-label="加粗"
          aria-pressed={editor.isActive("bold")}
          className={editor.isActive("bold") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
          type="button"
        >
          B
        </button>
        <button
          aria-label="斜体"
          aria-pressed={editor.isActive("italic")}
          className={editor.isActive("italic") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          type="button"
        >
          I
        </button>
        <button
          aria-label="无序列表"
          aria-pressed={editor.isActive("bulletList")}
          className={editor.isActive("bulletList") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          type="button"
        >
          • 列表
        </button>
      </div>
      <EditorContent className="document-body-input" editor={editor} />
      <div className="document-body-actions">
        <button
          className="document-body-save"
          onClick={() => props.onSave(serializeBody(editor.getJSON()))}
          type="button"
        >
          保存
        </button>
        <button onClick={props.onCancel} type="button">
          取消
        </button>
      </div>
    </div>
  );
}
