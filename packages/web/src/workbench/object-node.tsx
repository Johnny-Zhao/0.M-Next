import type { Node, NodeProps } from "@xyflow/react";
import type { ReactElement } from "react";

import type { DimensionId } from "./dimensions";
import { PortHandles } from "./ports";
import {
  FxChip,
  ProvenancePassport,
  RuleLamp,
  type RuleLampStatus,
} from "./widgets";

export type ObjectTypeVariant =
  | "system"
  | "module"
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

export type ObjectRuleStatus = RuleLampStatus;
export type ObjectDimensionTone = "normal" | "ok" | "warn" | "block" | "empty";

export interface ObjectFieldPreview {
  readonly code: string;
  readonly label: string;
  readonly value: string;
}

export interface ObjectDerivedChip {
  readonly fieldCode: string;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

export interface ObjectNodeData extends Record<string, unknown> {
  readonly objectId: string;
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
  readonly onDerivedChipClick?: (fieldCode: string) => void;
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
        <span className="object-node-kind" aria-hidden="true">
          <span className="object-node-icon">
            <TypeIcon variant={data.typeVariant} />
          </span>
        </span>
        <span className="object-node-title-block">
          <span className="object-node-meta">
            <span className="object-node-code">{data.code}</span>
            <span className="object-node-type-label">{data.objectType}</span>
          </span>
          <strong>{data.title}</strong>
        </span>
        <RuleLamp status={data.ruleStatus} />
      </header>
      <div className="object-node-divider" aria-hidden="true" />
      <section className="object-node-body">
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
        {data.derivedChips.length > 0 ? (
          <div className="object-node-fx-strip">
            <div className="fx-chip-list" aria-label="派生值">
              {data.derivedChips.map((chip) => (
                <button
                  className="fx-chip-action"
                  key={`${chip.label}-${chip.value}-${chip.unit ?? ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onDerivedChipClick?.(chip.fieldCode);
                  }}
                  title={`${chip.label} 血缘`}
                  type="button"
                >
                  <FxChip
                    label={chip.label}
                    unit={chip.unit}
                    value={chip.value}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      {data.provenanceText ? (
        <footer className="object-node-afterbody">
          <ProvenancePassport text={data.provenanceText} />
          <span className="object-node-status">{data.status}</span>
        </footer>
      ) : (
        <span className="object-node-status object-node-status-floating">
          {data.status}
        </span>
      )}
    </article>
  );
}

function TypeIcon({
  variant,
}: {
  readonly variant: ObjectTypeVariant;
}): ReactElement {
  if (variant === "system" || variant === "subsystem") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M3 4h10v8H3z" />
        <path d="M5 6h6M5 9h6" />
      </svg>
    );
  }
  if (variant === "module" || variant === "component") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M5 3h6v3h2v4h-2v3H5v-3H3V6h2z" />
        <path d="M6.5 6.5h3v3h-3z" />
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
  return <TypeIcon variant="module" />;
}
