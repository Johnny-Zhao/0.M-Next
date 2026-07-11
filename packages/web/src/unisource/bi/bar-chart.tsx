import type { BiBarDef } from "../model/view-layer";
import { UsMonoTag } from "../primitives";

export function BarChart({ bars }: { readonly bars: readonly BiBarDef[] }) {
  return (
    <section className="us-bi-bars">
      <header>
        <strong>各渠道销量 · 本月</strong>
        <UsMonoTag>渠道销量表</UsMonoTag>
      </header>
      {bars.map((bar) => (
        <div className="us-bi-bar" data-tone={bar.tone} key={bar.label}>
          <span>{bar.label}</span>
          <i style={{ inlineSize: `${bar.percent}%` }} />
          <b className="us-data">{bar.value.toLocaleString("zh-CN")}</b>
        </div>
      ))}
    </section>
  );
}
