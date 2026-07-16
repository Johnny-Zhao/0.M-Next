import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  DocumentBodyToolbar,
  runDocumentBodyToolbarCommand,
} from "./body-editor";
import { bodyExtensions } from "./body-content";

describe("DocumentBodyToolbar", () => {
  it("renders only the supported body controls and disables them without an editor", () => {
    const toolbar = DocumentBodyToolbar({ editor: null, disabled: true });
    const children = toolbar.props.children as readonly {
      readonly props?: Record<string, unknown>;
      readonly type?: unknown;
    }[];

    expect(toolbar.props["aria-label"]).toBe("正文格式");
    expect(children[0]?.props?.children).toBe("正文");
    expect(children.slice(1).map((child) => child.props?.["disabled"])).toEqual(
      [true, true, true],
    );
    expect(
      children.slice(1).map((child) => child.props?.["aria-label"]),
    ).toEqual(["加粗", "斜体", "无序列表"]);
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
});
