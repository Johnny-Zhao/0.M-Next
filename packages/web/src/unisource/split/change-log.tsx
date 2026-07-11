import type { ChangeEvent, Member } from "../model/view-layer";
import type { DataObject } from "../model/kernel";

export interface ChangeLogItemVm {
  readonly id: string;
  readonly actorName: string;
  readonly summary: string;
  readonly at: string;
}

export function deriveChangeLogItems(params: {
  readonly events: readonly ChangeEvent[];
  readonly objects: readonly DataObject[];
  readonly members: readonly Member[];
  readonly objectTypeCode: string;
}): readonly ChangeLogItemVm[] {
  const objects = new Map(
    params.objects
      .filter((object) => object.objectTypeCode === params.objectTypeCode)
      .map((object) => [object.id, object]),
  );
  return [...params.events]
    .filter(
      (event) =>
        event.target.entityType === "field" &&
        objects.has(event.target.entityId),
    )
    .sort((left, right) => right.at.localeCompare(left.at))
    .map((event) => {
      const member = params.members.find(
        (candidate) => candidate.id === event.actor,
      );
      return {
        id: event.id,
        actorName: member?.name ?? event.actor,
        summary: `${event.target.fieldCode ?? "字段"}: ${String(
          event.old ?? "空",
        )} → ${String(event.next ?? "空")}`,
        at: event.at,
      };
    });
}

export function ChangeLog({
  items,
}: {
  readonly items: readonly ChangeLogItemVm[];
}) {
  return (
    <aside className="us-changelog">
      <header>最近字段变更</header>
      {items.length === 0 ? <p>暂无字段变更</p> : null}
      {items.slice(0, 5).map((item) => (
        <article key={item.id}>
          <strong>{item.actorName}</strong>
          <span>{item.summary}</span>
          <time>{item.at.slice(11, 16)}</time>
        </article>
      ))}
    </aside>
  );
}
