import { useEffect, useState, type ReactElement } from "react";
import {
  CommandClient,
  DetailPanel,
  DocumentView,
  GraphView,
  SelectionCoordinator,
  TableView,
  TreeView,
  ViewClient,
  type FetchFn,
  type SyncStatus,
} from "@m-next/views";

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
  const [activeView, setActiveView] = useState<
    "table" | "tree" | "graph" | "document"
  >("table");
  const [rootId, setRootId] = useState("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
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
        <nav aria-label="视图栏">
          <button onClick={() => setActiveView("table")} type="button">
            表格
          </button>
          <button onClick={() => setActiveView("tree")} type="button">
            树
          </button>
          <button onClick={() => setActiveView("graph")} type="button">
            图谱
          </button>
          <button onClick={() => setActiveView("document")} type="button">
            文档
          </button>
        </nav>
        <section className="view-area">
          {activeView === "table" ? (
            <TableView
              commandClient={commandClient}
              objectType="demo_object"
              onError={() => setErrors((value) => value + 1)}
              selection={selection}
              viewClient={viewClient}
              workspaceId={workspaceId}
            />
          ) : null}
          {activeView !== "table" ? (
            <label>
              根对象:
              <input
                onChange={(event) => setRootId(event.currentTarget.value)}
                value={rootId}
              />
            </label>
          ) : null}
          {activeView === "tree" ? (
            <TreeView
              client={viewClient}
              relationType="decomposes_to"
              rootId={rootId}
              selection={selection}
              workspaceId={workspaceId}
            />
          ) : null}
          {activeView === "graph" ? (
            <GraphView
              client={viewClient}
              depth={2}
              direction="out"
              relationType="depends_on"
              selection={selection}
              sourceId={rootId}
              workspaceId={workspaceId}
            />
          ) : null}
          {activeView === "document" ? (
            <DocumentView
              onEditField={() => setActiveView("table")}
              onError={() => setErrors((value) => value + 1)}
              relationType="decomposes_to"
              rootId={rootId}
              selection={selection}
              viewClient={viewClient}
              workspaceId={workspaceId}
            />
          ) : null}
          <DetailPanel
            client={viewClient}
            selection={selection}
            workspaceId={workspaceId}
          />
        </section>
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
