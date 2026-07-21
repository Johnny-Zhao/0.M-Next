import type { BiBarDef } from "../model/view-layer";
import { UsMonoTag } from "../primitives";

export function BarChart({
  bars,
  title,
  sourceLabel,
  emptyLabel,
  onSelect,
}: {
  readonly bars: readonly BiBarDef[];
  readonly title: string;
  readonly sourceLabel: string;
  readonly emptyLabel: string;
  readonly onSelect?: (bar: BiBarDef) => void;
}) {
  return (
    <section className="us-bi-bars">
      <header>
        <strong>{title}</strong>
        <UsMonoTag>{sourceLabel}</UsMonoTag>
      </header>
      {bars.length === 0 ? <p role="status">{emptyLabel}</p> : null}
      {bars.map((bar) => (
        <div
          className="us-bi-bar"
          data-tone={bar.tone}
          key={bar.label}
          onClick={bar.objectId && onSelect ? () => onSelect(bar) : undefined}
          role={bar.objectId && onSelect ? "button" : undefined}
        >
          <span>{bar.label}</span>
          <i style={{ inlineSize: `${bar.percent}%` }} />
          <b className="us-data">{bar.value.toLocaleString("zh-CN")}</b>
        </div>
      ))}
    </section>
  );
}
