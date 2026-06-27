import type { ReactElement } from "react";

export type RuleLampStatus = "BLOCK" | "WARN" | "OK" | "UNKNOWN" | "TODO";
export type StateTagStatus =
  | "default"
  | "recomputing"
  | "blocked"
  | "stale"
  | "vetoed";

export interface FxChipProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly readOnly?: boolean;
}

export function FxChip({
  label,
  value,
  unit,
  readOnly = true,
}: FxChipProps): ReactElement {
  return (
    <span
      className="fx-chip"
      aria-label={`${label} ${value}${unit ?? ""}${
        readOnly ? " 后端实时只读" : ""
      }`}
    >
      <span className="fx-chip-mark" aria-hidden="true">
        fx
      </span>
      <span className="fx-chip-label">{label}</span>
      <span className="fx-chip-value">{value}</span>
      {unit ? <span className="fx-chip-unit">{unit}</span> : null}
      {readOnly ? <span className="fx-chip-source">后端实时·只读</span> : null}
    </span>
  );
}

export function RuleLamp({
  status,
}: {
  readonly status: RuleLampStatus;
}): ReactElement {
  const meta = ruleLampMeta(status);
  return (
    <span
      className={`rule-lamp rule-lamp-${status.toLowerCase()}`}
      aria-label={`规则 ${meta.label}`}
    >
      <span aria-hidden="true" className="rule-lamp-mark">
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );
}

function ruleLampMeta(status: RuleLampStatus): {
  readonly icon: string;
  readonly label: string;
} {
  if (status === "BLOCK") return { icon: "×", label: "阻断" };
  if (status === "WARN") return { icon: "!", label: "告警" };
  if (status === "OK") return { icon: "✓", label: "达标" };
  if (status === "TODO") return { icon: "…", label: "待接入" };
  return { icon: "?", label: "未知" };
}

export function ProvenancePassport({
  text,
  source,
  freshness,
  downstream,
}: {
  readonly text?: string | null;
  readonly source?: string | null;
  readonly freshness?: string | null;
  readonly downstream?: number;
}): ReactElement | null {
  const parts =
    text !== undefined
      ? [text]
      : [
          source ? `来源 ${source}` : null,
          freshness ? `新鲜 ${freshness}` : null,
          downstream !== undefined ? `下游 ${downstream}` : null,
        ];
  const label = parts.filter(Boolean).join(" · ");
  if (!label) return null;
  return <span className="provenance-passport">{label}</span>;
}

export function StateTag({
  status,
}: {
  readonly status: StateTagStatus;
}): ReactElement | null {
  const label = stateTagLabel(status);
  if (!label) return null;
  return <span className={`state-tag state-tag-${status}`}>{label}</span>;
}

function stateTagLabel(status: StateTagStatus): string | null {
  if (status === "recomputing") return "重算中";
  if (status === "blocked") return "阻断";
  if (status === "stale") return "陈旧";
  if (status === "vetoed") return "已否决";
  return null;
}
