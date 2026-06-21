import { useEffect, useState, type ReactElement } from "react";
import {
  CommandClient,
  SelectionCoordinator,
  ViewClient,
  type FetchFn,
  type SyncStatus,
} from "@m-next/views";

import { Workbench } from "./workbench/workbench";

const demoWorkspace = "11111111-1111-4111-8111-111111111111";

export interface AppProps {
  readonly baseUrl?: string;
  readonly fetchFn?: FetchFn;
}

export function App({
  baseUrl = "",
  fetchFn = fetch,
}: AppProps = {}): ReactElement {
  const [workspaceId, setWorkspaceId] = useState(demoWorkspace);
  const [errors, setErrors] = useState(0);
  const [sync, setSync] = useState<SyncStatus | "error">({
    pendingEvents: 0,
    caughtUp: true,
  });
  const [selection] = useState(() => new SelectionCoordinator());
  const [viewClient] = useState(() => new ViewClient(baseUrl, fetchFn));
  const [commandClient] = useState(() => new CommandClient(baseUrl, fetchFn));

  useEffect(
    () => selection.switchWorkspace(workspaceId),
    [selection, workspaceId],
  );
  useEffect(() => {
    const refresh = () =>
      void viewClient
        .syncStatus(workspaceId)
        .then(setSync)
        .catch(() => setSync("error"));
    refresh();
    const timer = globalThis.setInterval(refresh, 2000);
    return () => globalThis.clearInterval(timer);
  }, [viewClient, workspaceId]);

  return (
    <main className="workbench">
      <header>
        <strong>M-Next</strong>
        <label>
          工作空间:
          <select
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.currentTarget.value)}
          >
            <option value={demoWorkspace}>技术方案A</option>
          </select>
        </label>
        <SyncBadge sync={sync} />
      </header>
      <div className="workbench-body">
        <Workbench
          commandClient={commandClient}
          onError={() => setErrors((value) => value + 1)}
          selection={selection}
          viewClient={viewClient}
          workspaceId={workspaceId}
        />
      </div>
      <footer>
        待同步事件 {sync === "error" ? "?" : sync.pendingEvents} | 错误 {errors}
      </footer>
    </main>
  );
}

export function syncLabel(sync: SyncStatus | "error"): string {
  if (sync === "error") return "红 异常";
  return sync.caughtUp ? "绿 已追平" : `黄 同步中 ${sync.pendingEvents}`;
}

function SyncBadge({
  sync,
}: {
  readonly sync: SyncStatus | "error";
}): ReactElement {
  return <span aria-label="同步状态">{syncLabel(sync)}</span>;
}
