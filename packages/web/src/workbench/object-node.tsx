import type { Node, NodeProps } from "@xyflow/react";
import type { ReactElement } from "react";

import { PortHandles } from "./ports";

export type ObjectTypeVariant =
  | "subsystem"
  | "component"
  | "interface"
  | "requirement";

export type ObjectVisualState =
  | "default"
  | "recomputing"
  | "blocked"
  | "stale"
  | "vetoed";

export type ObjectRuleStatus = "BLOCK" | "WARN" | "OK" | "TODO";

export interface ObjectFieldPreview {
  readonly code: string;
  readonly value: string;
}

export interface ObjectNodeData extends Record<string, unknown> {
  readonly title: string;
  readonly objectType: string;
  readonly status: string;
  readonly code: string;
  readonly typeVariant: ObjectTypeVariant;
  readonly fields: readonly ObjectFieldPreview[];
  readonly fxText: string;
  readonly ruleStatus: ObjectRuleStatus;
  readonly provenanceText: string;
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
        {data.fields.map((field) => (
          <div className="object-node-field" key={field.code}>
            <dt>{field.code}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
      <footer className="object-node-footer">
        <span className="fx-chip" aria-label={`派生值 ${data.fxText}`}>
          <span aria-hidden="true">fx</span>
          {data.fxText}
        </span>
        <span className="provenance-passport">{data.provenanceText}</span>
      </footer>
      <span className="object-node-status">{data.status}</span>
    </article>
  );
}

function RuleLamp({
  status,
}: {
  readonly status: ObjectRuleStatus;
}): ReactElement {
  const label = status === "TODO" ? "TODO(view-API)" : status;
  return (
    <span className={`rule-lamp rule-lamp-${status.toLowerCase()}`}>
      <span aria-hidden="true" className="rule-lamp-mark" />
      {label}
    </span>
  );
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
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M5 3h6v3h2v4h-2v3H5v-3H3V6h2z" />
      <path d="M6.5 6.5h3v3h-3z" />
    </svg>
  );
}
