import { useMemo, useState } from "react";

import { UsButton, UsMonoTag } from "../primitives";
import { useSessionSnapshot } from "../state/session-store";
import { workspaceStore, useWorkspaceSnapshot } from "../state/workspace-store";

type TrackFilter = "all" | "data" | "view";

export function CanvasVersionsPanel({ viewId }: { viewId: string }) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const [filter, setFilter] = useState<TrackFilter>("all");
  const events = useMemo(
    () =>
      workspace.changeEvents.filter((event) => {
        if (filter !== "all" && event.track !== filter) return false;
        if (event.track === "view") return event.target.entityId === viewId;
        if (event.target.entityType === "object") return true;
        if (event.target.entityType === "relation") return true;
        return true;
      }),
    [workspace.changeEvents, filter, viewId],
  );

  return (
    <div className="us-canvas-inspector us-canvas-versions">
      <div className="us-canvas-version-filter">
        {(["all", "data", "view"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {item === "all" ? "全部" : item === "data" ? "数据轨" : "视图轨"}
          </button>
        ))}
      </div>
      <ol className="us-canvas-version-list">
        {events.map((event) => (
          <li key={event.id} data-track={event.track}>
            <div>
              <UsMonoTag tone={event.track === "view" ? "primary" : "change"}>
                {event.track.toUpperCase()}
              </UsMonoTag>
              <span className="us-data">{event.id}</span>
            </div>
            <p>{String(event.next ?? event.old ?? event.target.entityId)}</p>
            <span className="us-data">{event.at}</span>
            <UsButton
              size="sm"
              disabled={!event.inverse && !event.inverseView}
              onClick={() => {
                workspaceStore.undo(event.id);
              }}
            >
              恢复
            </UsButton>
          </li>
        ))}
      </ol>
      <p className="us-canvas-version-note">
        当前身份 <span className="us-data">{session.currentMemberId}</span>。
        视图轨恢复只回滚画布布局，不写入数据字段。
      </p>
    </div>
  );
}
