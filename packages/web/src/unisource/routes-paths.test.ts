import { describe, expect, it } from "vitest";

import { parseFormParam, US_BASENAME, usPaths } from "./routes-paths";

describe("usPaths(交接规格 §01 路由建议)", () => {
  it("独立路由", () => {
    expect(usPaths.home).toBe("/home");
    expect(usPaths.source("prd-spec")).toBe("/source/prd-spec");
    expect(usPaths.validate).toBe("/source/validate");
    expect(usPaths.import).toBe("/import");
    expect(usPaths.plugins).toBe("/settings/plugins");
    expect(usPaths.access).toBe("/settings/access");
  });

  it("表达页 form 参数化", () => {
    expect(usPaths.expr("exp-spec-doc")).toBe("/expr/exp-spec-doc");
    expect(usPaths.expr("exp-spec-doc", "doc")).toBe(
      "/expr/exp-spec-doc?form=doc",
    );
    expect(`${US_BASENAME}${usPaths.expr("exp-pc-plan-map", "canvas")}`).toBe(
      "/us/expr/exp-pc-plan-map?form=canvas",
    );
  });
});

describe("parseFormParam", () => {
  it("合法值透传", () => {
    expect(parseFormParam(new URLSearchParams("form=matrix"), "doc")).toBe(
      "matrix",
    );
  });
  it("缺失/非法值回退默认", () => {
    expect(parseFormParam(new URLSearchParams(), "doc")).toBe("doc");
    expect(parseFormParam(new URLSearchParams("form=xxx"), "grid")).toBe(
      "grid",
    );
  });
});
