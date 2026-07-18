import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExpressionErrorBoundary } from "./expression-error-boundary";

describe("ExpressionErrorBoundary", () => {
  it("renders a retryable fallback after a child render error", () => {
    const boundary = new ExpressionErrorBoundary({
      children: createElement("div", null, "child"),
      resetKey: "canvas",
    });
    boundary.state = {
      ...boundary.state,
      ...ExpressionErrorBoundary.getDerivedStateFromError(new Error("boom")),
    };

    const html = renderToStaticMarkup(boundary.render());

    expect(html).toContain("视图渲染失败");
    expect(html).toContain("重试");
    expect(html).not.toContain("boom");
  });
});
