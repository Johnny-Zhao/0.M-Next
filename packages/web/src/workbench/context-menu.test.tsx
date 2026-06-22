import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DiagramContextMenu,
  type DiagramContextMenuState,
} from "./context-menu";

describe("DiagramContextMenu", () => {
  it("renders node actions progressively", () => {
    const html = render({ context: { kind: "node", nodeId: "obj-a" } });
    expect(html).toContain("删除");
    expect(html).toContain("再制");
    expect(html).toContain("复制");
    expect(html).toContain("查看详情");
    expect(html).not.toContain("新建对象");
  });

  it("renders edge actions progressively", () => {
    const html = render({ context: { kind: "edge", edgeId: "rel-a" } });
    expect(html).toContain("删除关系");
    expect(html).not.toContain("复制");
    expect(html).not.toContain("新建对象");
  });

  it("renders pane actions progressively", () => {
    const html = render({ context: { kind: "pane" } });
    expect(html).toContain("粘贴");
    expect(html).toContain("新建对象");
    expect(html).toContain("全选");
    expect(html).not.toContain("删除关系");
  });
});

function render(menu: Pick<DiagramContextMenuState, "context">): string {
  const noop = vi.fn();
  return renderToStaticMarkup(
    <DiagramContextMenu
      canPaste
      menu={{ ...menu, x: 10, y: 12 }}
      onClose={noop}
      onCopy={noop}
      onCreateObject={noop}
      onDelete={noop}
      onDuplicate={noop}
      onPaste={noop}
      onSelectAll={noop}
      onViewDetail={noop}
    />,
  );
}
