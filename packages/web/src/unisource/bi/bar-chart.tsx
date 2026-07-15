import type { BiBarDef } from "../model/view-layer";
import { UsMonoTag } from "../primitives";

export function BarChart({
  bars,
  title,
  sourceLabel,
  emptyLabel,
}: {
  readonly bars: readonly BiBarDef[];
  readonly title: string;
  readonly sourceLabel: string;
  readonly emptyLabel: string;
}) {
  return (
    <section className="us-bi-bars">
      <header>
        <strong>{title}</strong>
        <UsMonoTag>{sourceLabel}</UsMonoTag>
      </header>
      {bars.length === 0 ? <p role="status">{emptyLabel}</p> : null}
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
