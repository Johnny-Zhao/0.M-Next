import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  WorkbenchShellChrome,
  shellDimensionLabels,
  shellMenuLabels,
  shellToolbarViewLabels,
} from "./shell-chrome";

describe("WorkbenchShellChrome", () => {
  it("exposes the menu bar groups", () => {
    expect(shellMenuLabels).toEqual(["文件", "编辑", "视图", "模型", "校验"]);
  });

  it("exposes the primary view and dimension toolbar entries", () => {
    expect(shellToolbarViewLabels).toEqual([
      "图",
      "表",
      "矩阵",
      "映射",
      "文档",
      "平面图",
    ]);
    expect(shellDimensionLabels).toEqual([
      "全部",
      "能量",
      "热",
      "质量",
      "光",
      "风",
    ]);
  });

  it("shows connection guidance without a disabled connection button", () => {
    const html = renderToStaticMarkup(
      createElement(WorkbenchShellChrome, {
        activePanel: "tree",
        advancedOpen: false,
        documentOutputAction: null,
        themeLabel: "亮色",
        onGenerateOutput: () => undefined,
        onOpenCommandPalette: () => undefined,
        onOpenPanel: () => undefined,
        onRefreshViews: () => undefined,
        onRevalidate: () => undefined,
        onToggleAdvanced: () => undefined,
        onToggleTheme: () => undefined,
      }),
    );

    expect(html).toContain("连线:从节点端口拖拽");
    expect(html).not.toContain(
      'title="连线:在画布中从端口拖拽创建" type="button"',
    );
  });
});
