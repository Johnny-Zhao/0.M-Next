import type { Node, NodeProps } from "@xyflow/react";
import type { ReactElement } from "react";

import type { DimensionId } from "./dimensions";
import { PortHandles } from "./ports";

export type ObjectTypeVariant =
  | "subsystem"
  | "component"
  | "interface"
  | "requirement"
  | "room";

export type ObjectVisualState =
  | "default"
  | "recomputing"
  | "blocked"
  | "stale"
  | "vetoed";

export type ObjectRuleStatus = "BLOCK" | "WARN" | "OK" | "UNKNOWN" | "TODO";
export type ObjectDimensionTone = "normal" | "ok" | "warn" | "block" | "empty";

export interface ObjectFieldPreview {
  readonly code: string;
  readonly label: string;
  readonly value: string;
}

export interface ObjectDerivedChip {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

export interface ObjectNodeData extends Record<string, unknown> {
  readonly title: string;
  readonly objectType: string;
  readonly status: string;
  readonly code: string;
  readonly typeVariant: ObjectTypeVariant;
  readonly fields: readonly ObjectFieldPreview[];
  readonly derivedChips: readonly ObjectDerivedChip[];
  readonly ruleStatus: ObjectRuleStatus;
  readonly activeDimension?: DimensionId;
  readonly dimensionLabel?: string;
  readonly dimensionTone?: ObjectDimensionTone;
  readonly dimensionEmpty?: boolean;
  readonly provenanceText: string | null;
  readonly visualState: ObjectVisualState;
  readonly readonly: boolean;
}

export type ObjectFlowNode = Node<ObjectNodeData, "object">;

export function ObjectNode({
  data,
  selected,
}: NodeProps<ObjectFlowNode>): ReactElement {
  const classes = [
    "object-node",
    `object-node-${data.typeVariant}`,
    `object-node-state-${data.visualState}`,
    data.activeDimension ? `object-node-dimension-${data.activeDimension}` : "",
    data.dimensionTone
      ? `object-node-dimension-tone-${data.dimensionTone}`
      : "",
    selected ? "object-node-selected" : "",
    data.readonly ? "object-node-readonly" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      aria-label={`${data.objectType} ${data.title}`}
      className={classes}
      data-rule={data.ruleStatus}
      data-state={data.visualState}
    >
      <PortHandles />
      <div className="object-node-type-bar" aria-hidden="true" />
      <header className="object-node-header">
        <span className="object-node-icon" aria-hidden="true">
          <TypeIcon variant={data.typeVariant} />
        </span>
        <span className="object-node-title-block">
          <span className="object-node-code">{data.code}</span>
          <strong>{data.title}</strong>
        </span>
        <RuleLamp status={data.ruleStatus} />
      </header>
      <dl className="object-node-fields">
        {data.fields.length > 0
          ? data.fields.map((field) => (
              <div className="object-node-field" key={field.code}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))
          : null}
        {data.dimensionEmpty ? (
          <div className="object-node-field-empty">该维度无数据</div>
        ) : null}
      </dl>
      {data.derivedChips.length > 0 || data.provenanceText ? (
        <footer className="object-node-footer">
          {data.derivedChips.length > 0 ? (
            <div className="fx-chip-list" aria-label="派生值">
              {data.derivedChips.map((chip) => (
                <span
                  className="fx-chip"
                  key={`${chip.label}-${chip.value}-${chip.unit ?? ""}`}
                  aria-label={`${chip.label} ${chip.value}${chip.unit ?? ""} 后端实时只读`}
                >
                  <span className="fx-chip-mark" aria-hidden="true">
                    fx
                  </span>
                  <span className="fx-chip-label">{chip.label}</span>
                  <span className="fx-chip-value">{chip.value}</span>
                  {chip.unit ? (
                    <span className="fx-chip-unit">{chip.unit}</span>
                  ) : null}
                  <span className="fx-chip-source">后端实时·只读</span>
                </span>
              ))}
            </div>
          ) : null}
          {data.provenanceText ? (
            <span className="provenance-passport">{data.provenanceText}</span>
          ) : null}
        </footer>
      ) : null}
      <span className="object-node-status">{data.status}</span>
    </article>
  );
}

function RuleLamp({
  status,
}: {
  readonly status: ObjectRuleStatus;
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

function ruleLampMeta(status: ObjectRuleStatus): {
  readonly icon: string;
  readonly label: string;
} {
  if (status === "BLOCK") return { icon: "×", label: "阻断" };
  if (status === "WARN") return { icon: "!", label: "告警" };
  if (status === "OK") return { icon: "✓", label: "达标" };
  if (status === "TODO") return { icon: "…", label: "待接入" };
  return { icon: "?", label: "未知" };
}

function TypeIcon({
  variant,
}: {
  readonly variant: ObjectTypeVariant;
}): ReactElement {
  if (variant === "subsystem") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M3 4h10v8H3z" />
        <path d="M5 6h6M5 9h6" />
      </svg>
    );
  }
  if (variant === "interface") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M3 8h10" />
        <path d="M5 5l-3 3 3 3M11 5l3 3-3 3" />
      </svg>
    );
  }
  if (variant === "requirement") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M4 2h6l2 2v10H4z" />
        <path d="M6 7h4M6 10h4" />
      </svg>
    );
  }
  if (variant === "room") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M3 3h10v10H3z" />
        <path d="M3 8h4v5M9 3v4h4M10.5 13v-2" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M5 3h6v3h2v4h-2v3H5v-3H3V6h2z" />
      <path d="M6.5 6.5h3v3h-3z" />
    </svg>
  );
}
