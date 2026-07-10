import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ViewTreePanel,
  viewTreeGroups,
  viewTreeItemAction,
} from "./view-tree-panel";

describe("ViewTreePanel", () => {
  it("renders the technical proposal view groups and items", () => {
    const html = renderToStaticMarkup(
      createElement(ViewTreePanel, {
        activatePanel: () => undefined,
        setLeftPaneMode: () => undefined,
      }),
    );

    expect(viewTreeGroups).toHaveLength(3);
    expect(viewTreeGroups.map((group) => group.items.length)).toEqual([
      3, 2, 1,
    ]);
    expect(html).toContain("总体设计");
    expect(html).toContain("系统总图");
    expect(html).toContain("参数总表");
    expect(html).toContain("依赖矩阵");
    expect(html).toContain("设计说明");
  });

  it("maps clickable entries to panel activation and left pane mode", () => {
    const [diagram, table, matrix] = viewTreeGroups[0].items;
    const [document] = viewTreeGroups[2].items;

    expect(viewTreeItemAction(diagram)).toEqual({
      panelId: "diagram",
      mode: "diagram-tools",
    });
    expect(viewTreeItemAction(table)).toEqual({
      panelId: "table",
      mode: "view-tree",
    });
    expect(viewTreeItemAction(matrix)).toEqual({
      panelId: "matrix",
      mode: "view-tree",
    });
    expect(viewTreeItemAction(document)).toEqual({
      panelId: "document",
      mode: "view-tree",
    });
  });

  it("keeps placeholder entries disabled", () => {
    expect(viewTreeItemAction(viewTreeGroups[1].items[0])).toBeNull();
    expect(viewTreeItemAction(viewTreeGroups[1].items[1])).toBeNull();
  });
});
