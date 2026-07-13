import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { applyDemoSeed } from "../state/demo-reset";
import { AccessView } from "./access-view";

describe("AccessView", () => {
  it("renders projected space roles and Chen Mo's split permission note", () => {
    applyDemoSeed(cloneDemoSeed());

    const html = renderToStaticMarkup(<AccessView />);

    expect(html).toContain("ADMIN");
    expect(html).toContain("AUTHOR");
    expect(html).toContain("VIEWER");
    expect(html).toContain("AUTHOR · 作者");
    expect(html).toContain("数据只读 + 表达可编");
    expect(html).toContain("前端 G2 投影");
  });

  it("renders projected space roles as mono badges", () => {
    applyDemoSeed(cloneDemoSeed());

    const html = renderToStaticMarkup(<AccessView />);

    expect(html).toContain('class="us-monotag">ADMIN</span>');
    expect(html).toContain('class="us-monotag">AUTHOR</span>');
    expect(html).toContain('class="us-monotag">VIEWER</span>');
  });
});
