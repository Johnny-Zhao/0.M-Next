import { useState } from "react";

import { UsMonoTag } from "../primitives";
import type { LibraryItemVm, TemplateLibraryVm } from "./template-view-model";

export function LibraryPanel({
  canEdit,
  draggingId,
  library,
  onBind,
  onDragEnd,
  onDragStart,
}: {
  canEdit: boolean;
  draggingId: string | null;
  library: TemplateLibraryVm;
  onBind: (item: LibraryItemVm) => void;
  onDragEnd: () => void;
  onDragStart: (objectId: string) => void;
}) {
  const [chipset, setChipset] = useState<string | null>(null);
  const items = chipset
    ? library.items.filter((item) => item.chipset === chipset)
    : library.items;
  return (
    <aside className="us-library-panel" aria-label="模板库面板">
      <header>
        <span>{library.title}</span>
        <UsMonoTag>
          {library.sourceLabel} · {library.total}
        </UsMonoTag>
      </header>
      <div className="us-library-chips">
        <button
          type="button"
          aria-pressed={chipset === null}
          onClick={() => setChipset(null)}
        >
          符合约束 <span className="us-data">{library.matching}</span>
        </button>
        {library.chipsetCounts.map((item) => (
          <button
            key={item.chipset}
            type="button"
            aria-pressed={chipset === item.chipset}
            onClick={() => setChipset(item.chipset)}
          >
            {item.chipset} · <span className="us-data">{item.count}</span>
          </button>
        ))}
      </div>
      <div className="us-library-list">
        {items.map((item) => (
          <button
            key={item.objectId}
            type="button"
            draggable={canEdit && item.matchState === "match"}
            data-state={item.matchState}
            data-dragging={draggingId === item.objectId}
            disabled={!canEdit || item.matchState !== "match"}
            onClick={() => onBind(item)}
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", item.objectId);
              onDragStart(item.objectId);
            }}
            onDragEnd={onDragEnd}
          >
            <span>
              <strong>{item.name}</strong>
              <small className="us-data">{item.specLine}</small>
              {item.matchState !== "match" ? <em>{item.reason}</em> : null}
              {draggingId === item.objectId ? <em>拖拽中…</em> : null}
            </span>
            <span className="us-data">{item.priceText}</span>
          </button>
        ))}
      </div>
      <p>点击或拖入槽位即可实例化。字段随硬件产品库更新。</p>
    </aside>
  );
}
