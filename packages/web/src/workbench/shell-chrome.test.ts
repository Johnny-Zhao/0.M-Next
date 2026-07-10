import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  WorkbenchShellChrome,
  shellDimensionLabels,
  shellMenuLabels,
  shellToolbarViewLabels,
  validateToolbarAction,
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

  it("enables the connection toolbar action when diagram view is active", () => {
    const html = renderToStaticMarkup(
      createElement(WorkbenchShellChrome, {
        activePanel: "diagram",
        advancedOpen: false,
        connectionMode: true,
        connectionModeAvailable: true,
        createObjectAction: createElement(
          "span",
          null,
          "+ 新增模块 + 新增需求",
        ),
        documentOutputAction: null,
        themeLabel: "亮色",
        onGenerateOutput: () => undefined,
        onOpenCommandPalette: () => undefined,
        onOpenPanel: () => undefined,
        onRefreshViews: () => undefined,
        onRevalidate: () => undefined,
        onToggleConnectionMode: () => undefined,
        onToggleAdvanced: () => undefined,
        onToggleTheme: () => undefined,
      }),
    );

    expect(html).toContain("连线");
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("请切到图视图后进入连线模式");
    expect(html).toContain("+ 新增模块 + 新增需求");
    expect(html).not.toContain("新建对象");
  });

  it("disables the connection toolbar action outside diagram view", () => {
    const html = renderToStaticMarkup(
      createElement(WorkbenchShellChrome, {
        activePanel: "table",
        advancedOpen: false,
        connectionMode: false,
        connectionModeAvailable: false,
        documentOutputAction: null,
        themeLabel: "亮色",
        onGenerateOutput: () => undefined,
        onOpenCommandPalette: () => undefined,
        onOpenPanel: () => undefined,
        onRefreshViews: () => undefined,
        onRevalidate: () => undefined,
        onToggleConnectionMode: () => undefined,
        onToggleAdvanced: () => undefined,
        onToggleTheme: () => undefined,
      }),
    );

    expect(html).toContain("连线");
    expect(html).toContain("请切到图视图后进入连线模式");
    expect(html).toContain("disabled");
  });

  it("filters toolbar view entries when visibleViewIds is provided", () => {
    const html = renderToStaticMarkup(
      createElement(WorkbenchShellChrome, {
        activePanel: "diagram",
        advancedOpen: false,
        documentOutputAction: null,
        themeLabel: "亮色",
        visibleViewIds: ["diagram", "table", "matrix", "document"],
        onGenerateOutput: () => undefined,
        onOpenCommandPalette: () => undefined,
        onOpenPanel: () => undefined,
        onRefreshViews: () => undefined,
        onRevalidate: () => undefined,
        onToggleAdvanced: () => undefined,
        onToggleTheme: () => undefined,
      }),
    );

    expect(html).toContain("图");
    expect(html).toContain("表");
    expect(html).toContain("矩阵");
    expect(html).toContain("文档");
    expect(html).not.toContain("映射</button>");
    expect(html).not.toContain("平面图</button>");
  });
});

describe("validateToolbarAction", () => {
  it("uses the validation drawer toggle when provided", () => {
    const revalidate = () => undefined;
    const toggle = () => undefined;

    expect(validateToolbarAction(revalidate)).toBe(revalidate);
    expect(validateToolbarAction(revalidate, toggle)).toBe(toggle);
  });
});
