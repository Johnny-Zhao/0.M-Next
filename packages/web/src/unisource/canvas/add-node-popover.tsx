import type { DataObject } from "../model/kernel";
import { UsStatusPill } from "../primitives";

export function AddNodePopover({
  existingObjectIds,
  objects,
  onAdd,
  onClose,
}: {
  readonly existingObjectIds: readonly string[];
  readonly objects: readonly DataObject[];
  readonly onAdd: (objectId: string) => void;
  readonly onClose: () => void;
}) {
  const existingIds = new Set(existingObjectIds);
  return (
    <div className="us-addnode" role="dialog" aria-label="从数据源添加">
      <header>
        <span>从产品规格库添加</span>
        <button type="button" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </header>
      {objects.map((object) => {
        const exists = existingIds.has(object.id);
        return (
          <button
            disabled={exists}
            key={object.id}
            onClick={() => onAdd(object.id)}
            type="button"
          >
            <span>
              <strong>{String(object.fields.name?.value ?? object.id)}</strong>
              <small className="us-data">{object.fields.sku?.value}</small>
            </span>
            <UsStatusPill
              tone={
                object.status === "presale"
                  ? "presale"
                  : object.status === "eol"
                    ? "eol"
                    : object.status === "dev"
                      ? "dev"
                      : "sale"
              }
            >
              {exists ? "已在视图" : object.status}
            </UsStatusPill>
          </button>
        );
      })}
    </div>
  );
}
