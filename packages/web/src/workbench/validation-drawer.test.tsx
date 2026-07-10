import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ValidationDrawerView,
  validationSummaryText,
} from "./validation-drawer";

describe("ValidationDrawerView", () => {
  it("renders only the thin status bar when collapsed", () => {
    const html = renderToStaticMarkup(
      createElement(ValidationDrawerView, {
        onClose: () => undefined,
        onToggle: () => undefined,
        open: false,
        panel: createElement("div", null, "ValidatePanel"),
        summary: { block: 1, warn: 2, ok: 3 },
      }),
    );

    expect(html).toContain("校验 6 · 红 1 黄 2 绿 3");
    expect(html).toContain("展开");
    expect(html).not.toContain("ValidatePanel");
  });

  it("renders ValidatePanel content and close affordance when open", () => {
    const html = renderToStaticMarkup(
      createElement(ValidationDrawerView, {
        onClose: () => undefined,
        onToggle: () => undefined,
        open: true,
        panel: createElement("div", null, "ValidatePanel"),
        summary: { block: 0, warn: 1, ok: 4 },
      }),
    );

    expect(html).toContain("校验 5 · 红 0 黄 1 绿 4");
    expect(html).toContain("收起");
    expect(html).toContain("ValidatePanel");
    expect(html).toContain("关闭校验抽屉");
  });

  it("wires the bar and close buttons to their callbacks", () => {
    const onToggle = vi.fn();
    const onClose = vi.fn();
    const element = ValidationDrawerView({
      onClose,
      onToggle,
      open: true,
      panel: createElement("div", null, "ValidatePanel"),
      summary: { block: 0, warn: 0, ok: 1 },
    });

    findElement(element, "validation-drawer-bar")?.props.onClick();
    findElement(element, undefined, "关闭校验抽屉")?.props.onClick();

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("formats unavailable summaries without throwing", () => {
    expect(validationSummaryText(null)).toBe("校验摘要不可用");
  });
});

function findElement(
  element: ReactElement,
  className?: string,
  ariaLabel?: string,
): ReactElement | null {
  if (
    (className && element.props.className === className) ||
    (ariaLabel && element.props["aria-label"] === ariaLabel)
  ) {
    return element;
  }
  const children = element.props.children;
  const childList = Array.isArray(children) ? children : [children];
  for (const child of childList) {
    if (isValidElement(child)) {
      const found = findElement(child, className, ariaLabel);
      if (found) return found;
    }
  }
  return null;
}
