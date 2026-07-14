import { Handle, Position, type NodeProps } from "@xyflow/react";

import { UsMonoTag } from "../primitives";
import type { TemplateSlotVm } from "./template-view-model";

export function SlotCard({ data, selected }: NodeProps) {
  const slot = data.slot as TemplateSlotVm;
  return (
    <article
      className="us-slot-card"
      data-state={slot.state}
      data-selected={selected}
    >
      <Handle
        className="us-slot-card__handle"
        position={Position.Left}
        type="target"
      />
      <Handle
        className="us-slot-card__handle"
        position={Position.Right}
        type="source"
      />
      <header>
        <span>{slot.label}</span>
        <UsMonoTag tone={slot.state === "violated" ? "change" : "primary"}>
          {stateLabel(slot.state)}
        </UsMonoTag>
      </header>
      {slot.objectName ? (
        <>
          <strong>{slot.objectName}</strong>
          <p className="us-data">
            {slot.sourceLabel} · {slot.objectId}
          </p>
        </>
      ) : (
        <>
          <strong>抽象:{slot.label}</strong>
          <p className="us-data">{slot.constraintText}</p>
        </>
      )}
      {slot.violationReason ? (
        <p className="us-slot-card__warn">{slot.violationReason}</p>
      ) : null}
      {slot.fields.length > 0 ? (
        <dl>
          {slot.fields.map((field) => (
            <div key={field.code}>
              <dt>{field.label}</dt>
              <dd className="us-data">{field.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

function stateLabel(state: TemplateSlotVm["state"]): string {
  if (state === "dangling") return "引用失效";
  if (state === "instantiated") return "已实例化";
  if (state === "activated") return "拖入实例化";
  if (state === "violated") return "需处理";
  return "待实例化";
}
