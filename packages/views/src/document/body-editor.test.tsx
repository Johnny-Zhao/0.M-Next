import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  DocumentBodyToolbar,
  documentBodyEditorActions,
  runDocumentBodyToolbarCommand,
} from "./body-editor";
import { bodyExtensions, parseBody, serializeBody } from "./body-content";

describe("DocumentBodyToolbar", () => {
  it("renders only the supported body controls and disables them without an editor", () => {
    const toolbar = DocumentBodyToolbar({ editor: null, disabled: true });
    const children = (
      toolbar.props.children as readonly {
        readonly props?: Record<string, unknown>;
        readonly type?: unknown;
      }[]
    ).filter(Boolean);

    expect(toolbar.props["aria-label"]).toBe("正文格式");
    expect(children[0]?.props?.children).toBe("正文");
    expect(children.slice(1).map((child) => child.props?.["disabled"])).toEqual(
      [true, true, true, true, true, true],
    );
    expect(
      children.slice(1).map((child) => child.props?.["aria-label"]),
    ).toEqual(["段落", "标题", "加粗", "斜体", "无序列表", "有序列表"]);
  });

  it("runs formatting commands against the single Tiptap editor instance", () => {
    const editor = new Editor({
      element: null,
      extensions: bodyExtensions(),
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "正文" }] },
        ],
      },
    });

    editor.commands.selectAll();
    expect(runDocumentBodyToolbarCommand(editor, "bold")).toBe(true);
    expect(runDocumentBodyToolbarCommand(editor, "italic")).toBe(true);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toEqual([
      { type: "bold" },
      { type: "italic" },
    ]);
    expect(runDocumentBodyToolbarCommand(editor, "bulletList")).toBe(true);
    expect(editor.getJSON().content?.[0]?.type).toBe("bulletList");
    editor.destroy();
  });

  it("serializes inserted data-block configuration without a data value", () => {
    const editor = new Editor({
      element: null,
      extensions: bodyExtensions(),
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    expect(
      documentBodyEditorActions(editor).insertDataReference({
        objectBinding: "document-root",
        fieldCode: "name",
      }),
    ).toBe(true);
    expect(JSON.stringify(editor.getJSON())).toContain('"fieldCode":"name"');
    expect(JSON.stringify(editor.getJSON())).not.toContain('"value"');
    editor.destroy();
  });

  it("moves selected data blocks one sibling at a time and preserves saved order", () => {
    const editor = new Editor({
      element: null,
      extensions: bodyExtensions(),
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "before" }] },
          {
            type: "dataReference",
            attrs: {
              config: { objectBinding: "document-root", fieldCode: "name" },
            },
          },
          { type: "paragraph", content: [{ type: "text", text: "after" }] },
        ],
      },
    });
    editor.commands.setNodeSelection(dataBlockPosition(editor));

    expect(documentBodyEditorActions(editor).canMoveSelectedBlockUp).toBe(true);
    expect(documentBodyEditorActions(editor).moveSelectedBlockUp()).toBe(true);
    expect(nodeTypes(editor)).toEqual([
      "dataReference",
      "paragraph",
      "paragraph",
    ]);
    expect(documentBodyEditorActions(editor).moveSelectedBlockDown()).toBe(
      true,
    );
    expect(nodeTypes(editor)).toEqual([
      "paragraph",
      "dataReference",
      "paragraph",
    ]);

    const saved = serializeBody(editor.getJSON());
    const restored = parseBody(saved);
    expect(restored.kind).toBe("doc");
    if (restored.kind === "doc") {
      expect(restored.doc.content?.map((node) => node.type)).toEqual([
        "paragraph",
        "dataReference",
        "paragraph",
      ]);
    }
    editor.destroy();
  });

  it("does not dispatch a transaction when a selected block is already at a boundary", () => {
    const editor = new Editor({
      element: null,
      extensions: bodyExtensions(),
      content: {
        type: "doc",
        content: [
          {
            type: "dataTable",
            attrs: {
              config: { objectTypeCode: "item", columns: [] },
            },
          },
        ],
      },
    });
    editor.commands.setNodeSelection(dataBlockPosition(editor));
    let transactions = 0;
    editor.on("transaction", () => transactions++);

    const actions = documentBodyEditorActions(editor);
    expect(actions.canMoveSelectedBlockUp).toBe(false);
    expect(actions.canMoveSelectedBlockDown).toBe(false);
    expect(actions.moveSelectedBlockUp()).toBe(false);
    expect(actions.moveSelectedBlockDown()).toBe(false);
    expect(transactions).toBe(0);
    editor.destroy();
  });
});

function dataBlockPosition(editor: Editor): number {
  let position = -1;
  editor.state.doc.descendants((node, currentPosition) => {
    if (node.type.name === "dataReference" || node.type.name === "dataTable") {
      position = currentPosition;
      return false;
    }
    return true;
  });
  if (position < 0) throw new Error("expected a data block");
  return position;
}

function nodeTypes(editor: Editor): readonly string[] {
  return editor.getJSON().content?.map((node) => node.type ?? "") ?? [];
}
