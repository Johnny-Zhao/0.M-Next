import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  CommandClient,
  SelectionCoordinator,
  ViewClient,
  type FetchFn,
  type SyncStatus,
} from "@m-next/views";

import { Home, type OpenWorkspaceRequest } from "./home/home";
import {
  applyTheme,
  nextTheme,
  readStoredTheme,
  storeTheme,
  themeLabel,
  type Theme,
} from "./theme";
import { ToastProvider, useToast } from "./toast";
import { Workbench } from "./workbench/workbench";

export interface AppProps {
  readonly baseUrl?: string;
  readonly fetchFn?: FetchFn;
}

interface ActiveWorkspace {
  readonly workspaceId: string;
  readonly name?: string;
  readonly templateCode?: string | null;
}

export function App({
  baseUrl = "",
  fetchFn = (input, init) => fetch(input, init),
}: AppProps = {}): ReactElement {
  return (
    <ToastProvider>
      <AppContent baseUrl={baseUrl} fetchFn={fetchFn} />
    </ToastProvider>
  );
}

function AppContent({
  baseUrl,
  fetchFn,
}: {
  readonly baseUrl: string;
  readonly fetchFn: FetchFn;
}): ReactElement {
  const [actorId, setActorId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<ActiveWorkspace | null>(null);
  const [errors, setErrors] = useState(0);
  const [sync, setSync] = useState<SyncStatus | "error">({
    pendingEvents: 0,
    caughtUp: true,
  });
  const [selection] = useState(() => new SelectionCoordinator());
  const [viewClient] = useState(() => new ViewClient(baseUrl, fetchFn));
  const [commandClient] = useState(() => new CommandClient(baseUrl, fetchFn));
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const toast = useToast();
  const reportError = useCallback(
    (message: string) => {
      setErrors((value) => value + 1);
      toast.error(message || "操作失败");
    },
    [toast],
  );

  useEffect(() => {
    applyTheme(theme, document.documentElement);
  }, [theme]);
  const toggleTheme = () => {
    const next = nextTheme(theme);
    setTheme(next);
    storeTheme(next);
  };

  useEffect(() => {
    if (workspace) selection.switchWorkspace(workspace.workspaceId);
  }, [selection, workspace]);
  useEffect(() => {
    if (actorId) commandClient.setActorId(actorId);
  }, [actorId, commandClient]);
  useEffect(() => {
    if (!workspace) return;
    const refresh = () =>
      void viewClient
        .syncStatus(workspace.workspaceId)
        .then(setSync)
        .catch(() => setSync("error"));
    refresh();
    const timer = globalThis.setInterval(refresh, 2000);
    return () => globalThis.clearInterval(timer);
  }, [viewClient, workspace]);

  if (!workspace) {
    return (
      <Home
        actorId={actorId}
        commandClient={commandClient}
        onLogin={setActorId}
        onOpenWorkspace={setWorkspace}
        viewClient={viewClient}
      />
    );
  }

  return (
    <main className="workbench">
      <header>
        <strong>M-Next</strong>
        <span className="workbench-brand-tag">制图工作台</span>
        <button onClick={() => setWorkspace(null)} type="button">
          返回项目
        </button>
        <span aria-label="当前项目">{workspaceLabel(workspace)}</span>
        <SyncBadge sync={sync} />
        <span aria-hidden="true" className="workbench-avatar">
          {actorInitial(actorId)}
        </span>
      </header>
      <div className="workbench-body">
        <Workbench
          actorId={actorId ?? "demo-actor"}
          commandClient={commandClient}
          onError={reportError}
          onToggleTheme={toggleTheme}
          selection={selection}
          themeLabel={themeLabel(theme)}
          viewClient={viewClient}
          workspaceId={workspace.workspaceId}
          templateCode={workspace.templateCode}
        />
      </div>
      <footer>
        待同步事件 {sync === "error" ? "?" : sync.pendingEvents} | 错误 {errors}
      </footer>
    </main>
  );
}

export function workspaceLabel(workspace: OpenWorkspaceRequest): string {
  const value = workspace.name?.trim();
  return value && value.length > 0 ? value : "当前项目";
}

export function actorInitial(actorId: string | null): string {
  const trimmed = actorId?.trim() ?? "";
  const first = [...trimmed].find((ch) => /\p{L}|\p{N}/u.test(ch));
  return first ? first.toUpperCase() : "叶";
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
