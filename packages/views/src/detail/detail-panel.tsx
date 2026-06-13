import { useEffect, useState, type ReactElement } from "react";

import type { ObjectDetail, ViewClient } from "../api/view-client";
import type { SelectionCoordinator } from "../selection/selection-coordinator";

export interface DetailPanelProps {
  readonly workspaceId: string;
  readonly client: ViewClient;
  readonly selection: SelectionCoordinator;
}

export function DetailPanel({
  workspaceId,
  client,
  selection,
}: DetailPanelProps): ReactElement {
  const [detail, setDetail] = useState<ObjectDetail | null>(null);
  useEffect(
    () =>
      selection.subscribe((selected) => {
        if (
          selected?.entityType === "object" ||
          selected?.entityType === "field"
        ) {
          void client.object(workspaceId, selected.entityId).then(setDetail);
        }
      }),
    [client, selection, workspaceId],
  );

  if (!detail) return <aside aria-label="对象详情">请选择对象</aside>;
  const object = detail.object;
  return (
    <aside aria-label="对象详情">
      <h2>{String(object.fields.name ?? object.objectId)}</h2>
      <p>
        {object.status} v{object.version}
      </p>
      <h3>字段</h3>
      {Object.entries(object.fields).map(([code, value]) => (
        <button
          key={code}
          onClick={() =>
            selection.select({
              entityType: "field",
              entityId: object.objectId,
              fieldCode: code,
            })
          }
          type="button"
        >
          {code}: {String(value)}
        </button>
      ))}
      <h3>关系</h3>
      {detail.relations.map((relation) => (
        <button
          key={relation.relationId}
          onClick={() =>
            selection.select({
              entityType: "relation",
              entityId: relation.relationId,
            })
          }
          type="button"
        >
          {relation.relationType}: {relation.sourceId} → {relation.targetId}
        </button>
      ))}
    </aside>
  );
}
