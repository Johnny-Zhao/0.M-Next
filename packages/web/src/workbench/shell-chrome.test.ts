import { describe, expect, it } from "vitest";

import {
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
});
