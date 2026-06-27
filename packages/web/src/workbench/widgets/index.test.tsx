import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FxChip, ProvenancePassport, RuleLamp, StateTag } from ".";

describe("workbench widgets", () => {
  it("renders fx chips with the existing read-only chrome", () => {
    const html = renderToStaticMarkup(
      <FxChip label="面积" unit="㎡" value="23.5" />,
    );

    expect(html).toContain("fx-chip");
    expect(html).toContain("fx-chip-mark");
    expect(html).toContain("后端实时·只读");
    expect(html).toContain("面积");
    expect(html).toContain("23.5");
  });

  it("renders rule lamps with color and icon classes", () => {
    const html = renderToStaticMarkup(<RuleLamp status="BLOCK" />);

    expect(html).toContain("rule-lamp-block");
    expect(html).toContain("rule-lamp-mark");
    expect(html).toContain("阻断");
  });

  it("renders provenance passports from text or parts", () => {
    expect(
      renderToStaticMarkup(
        <ProvenancePassport text="来源 人工绘制 · 新鲜 12m" />,
      ),
    ).toContain("来源 人工绘制");
    expect(
      renderToStaticMarkup(
        <ProvenancePassport downstream={2} freshness="刚刚" source="手填" />,
      ),
    ).toContain("来源 手填 · 新鲜 刚刚 · 下游 2");
  });

  it("renders stale state tags and omits the default state", () => {
    expect(renderToStaticMarkup(<StateTag status="stale" />)).toContain(
      "state-tag-stale",
    );
    expect(renderToStaticMarkup(<StateTag status="default" />)).toBe("");
  });
});
