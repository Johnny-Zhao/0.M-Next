import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExpressionGridFrame } from "./expression-grid-view";

describe("ExpressionGridFrame", () => {
  it("renders validation as a bottom sibling outside the scroll area", () => {
    const html = renderToStaticMarkup(
      <ExpressionGridFrame
        validationPanel={<aside data-testid="validation">validation</aside>}
      >
        <table data-testid="grid" />
      </ExpressionGridFrame>,
    );

    expect(html).toContain('class="us-expression-grid__scroll"');
    expect(html).toContain("</div><aside");
    expect(html.indexOf('data-testid="grid"')).toBeLessThan(
      html.indexOf('data-testid="validation"'),
    );
  });

  it("does not reserve a bottom region without validation config", () => {
    const html = renderToStaticMarkup(
      <ExpressionGridFrame validationPanel={null}>
        <table data-testid="grid" />
      </ExpressionGridFrame>,
    );

    expect(html).not.toContain("<aside");
    expect(html).toContain("</table></div></section>");
  });
});
