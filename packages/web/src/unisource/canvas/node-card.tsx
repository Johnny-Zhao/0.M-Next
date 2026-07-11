import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";

import { UsMonoTag, UsStatusPill } from "../primitives";
import type { SimNodePhase } from "../sim/sim-playback";
import type { CanvasNodeVm } from "./canvas-view-model";

interface NodeSimData {
  readonly phase: SimNodePhase;
  readonly timeText?: string;
  readonly label?: string;
  readonly check?: boolean;
}

export function NodeCard({ data, selected }: NodeProps) {
  const node = data.node as CanvasNodeVm;
  const sim = data.sim as NodeSimData | undefined;
  return (
    <article
      className="us-nodecard"
      data-fill={node.style.fill}
      data-selected={selected}
      data-sim-phase={sim?.phase}
      style={
        {
          "--us-node-radius": `${node.style.radius}px`,
          "--us-node-font": `${node.style.fontSize}px`,
        } as CSSProperties
      }
    >
      <Handle
        className="us-nodecard__handle"
        position={Position.Left}
        type="target"
      />
      <Handle
        className="us-nodecard__handle"
        position={Position.Right}
        type="source"
      />
      <header>
        <span className="us-data">{node.indexLabel}</span>
        <strong>{node.name}</strong>
      </header>
      <div className="us-nodecard__meta">
        {node.visibility.sourceBadge ? (
          <UsMonoTag>{node.sourceLabel}</UsMonoTag>
        ) : null}
        {sim?.phase === "source" ? (
          <UsMonoTag tone="change">事件源</UsMonoTag>
        ) : null}
        {sim?.phase === "running" ? (
          <UsMonoTag tone="change">运行中</UsMonoTag>
        ) : null}
        {sim?.phase === "done" ? (
          <UsMonoTag tone="primary">✓ {sim.timeText}</UsMonoTag>
        ) : null}
        {node.visibility.docBadge ? (
          <UsMonoTag tone="primary">{node.docRefs} 引用</UsMonoTag>
        ) : null}
      </div>
      {sim?.phase === "running" ? (
        <span className="us-nodecard__pulse" />
      ) : null}
      {sim?.label ? (
        <span className="us-nodecard__sim-label">
          {sim.check ? "✓ " : null}
          {sim.label}
        </span>
      ) : null}
      {node.visibility.fieldRows ? (
        <dl>
          <div>
            <dt>状态</dt>
            <dd>
              <UsStatusPill tone={statusTone(node.status)}>
                {node.status}
              </UsStatusPill>
            </dd>
          </div>
          {node.fields.map((field) => (
            <div key={field.code}>
              <dt>{field.label}</dt>
              <dd className="us-data">{field.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {selected ? (
        <>
          <i />
          <i />
          <i />
          <i />
        </>
      ) : null}
    </article>
  );
}

function statusTone(status: string): "sale" | "presale" | "dev" | "eol" {
  if (status === "presale" || status === "dev" || status === "eol") {
    return status;
  }
  return "sale";
}
