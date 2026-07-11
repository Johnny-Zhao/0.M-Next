import type { KpiCardDef } from "../model/view-layer";
import { UsAiBadge } from "../primitives";

export function KpiCard({ kpi }: { readonly kpi: KpiCardDef }) {
  return (
    <article className="us-bi-kpi" data-ai={kpi.aiAdded === true}>
      <header>
        <span>{kpi.label}</span>
        {kpi.aiAdded ? <UsAiBadge /> : null}
      </header>
      <strong className="us-data">{kpi.value}</strong>
      <footer data-sign={kpi.deltaSign}>
        <span>{kpi.delta}</span>
        <small>{kpi.sourceLabel}</small>
      </footer>
    </article>
  );
}
