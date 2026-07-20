import { useEffect, useMemo, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ViewClient, type WorkspaceSummary } from "@m-next/views";

import "./unisource/us-tokens.css";
import "./unisource/us-components.css";
import { UsLogoMark } from "./unisource/shell/logo";

const workspaceClient = new ViewClient("");

export function renderWorkspaceLauncher(
  element: HTMLElement | null,
): Root | null {
  if (!element) return null;
  const root = createRoot(element);
  root.render(<WorkspaceLauncher />);
  return root;
}

export function WorkspaceLauncher(): ReactElement {
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceSummary[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    void workspaceClient
      .workspaces()
      .then((items) => {
        if (!active) return;
        setWorkspaces(items);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return workspaces;
    return workspaces.filter((workspace) =>
      `${workspace.name} ${workspace.templateCode ?? ""}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, workspaces]);

  return (
    <main className="us-workspace-launcher">
      <header className="us-workspace-launcher__header">
        <div className="us-workspace-launcher__brand">
          <UsLogoMark size={30} />
          <span>
            <strong>同源</strong>
            <small>UNISOURCE</small>
          </span>
        </div>
        <span className="us-data">统一数据源 · 表达入口</span>
      </header>
      <section className="us-workspace-launcher__intro">
        <span className="us-data">WORKSPACES</span>
        <h1>选择一个工作空间</h1>
        <p>每个领域插件共享同一套数据源，进入后选择适合当前任务的表达方式。</p>
        <input
          aria-label="搜索工作空间"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="搜索电脑采购、室内设计…"
          value={query}
        />
      </section>
      <LauncherBody
        onOpen={openWorkspace}
        state={state}
        workspaces={filtered}
      />
    </main>
  );
}

export function workspaceLaunchLocation(workspaceId: string): string {
  const query = new URLSearchParams({ backend: "1", ws: workspaceId });
  return `/us/home?${query.toString()}`;
}

function openWorkspace(workspace: WorkspaceSummary): void {
  window.location.assign(workspaceLaunchLocation(workspace.workspaceId));
}

function LauncherBody({
  onOpen,
  state,
  workspaces,
}: {
  readonly onOpen: (workspace: WorkspaceSummary) => void;
  readonly state: "loading" | "ready" | "error";
  readonly workspaces: readonly WorkspaceSummary[];
}): ReactElement {
  if (state === "loading") {
    return <p className="us-workspace-launcher__status">正在读取工作空间…</p>;
  }
  if (state === "error") {
    return (
      <p className="us-workspace-launcher__status" role="alert">
        工作空间列表读取失败，请确认后端服务已启动。
      </p>
    );
  }
  if (workspaces.length === 0) {
    return (
      <p className="us-workspace-launcher__status">没有匹配的工作空间。</p>
    );
  }
  return (
    <section className="us-workspace-launcher__grid" aria-label="工作空间列表">
      {workspaces.map((workspace) => (
        <button
          className="us-workspace-launcher__card"
          key={workspace.workspaceId}
          onClick={() => onOpen(workspace)}
          type="button"
        >
          <span className="us-workspace-launcher__card-mark">
            {workspace.name.slice(0, 1)}
          </span>
          <span className="us-workspace-launcher__card-copy">
            <strong>{workspace.name}</strong>
            <small>{templateLabel(workspace.templateCode)}</small>
            <em>{workspace.workspaceId}</em>
          </span>
          <span aria-hidden="true" className="us-workspace-launcher__arrow">
            →
          </span>
        </button>
      ))}
    </section>
  );
}

function templateLabel(code: string | null): string {
  switch (code) {
    case "pc_procurement":
      return "电脑采购插件";
    case "interior_design":
      return "室内设计插件";
    case "hardware_products":
      return "硬件产品插件";
    case "technical_proposal":
      return "技术方案插件";
    default:
      return code ? "领域工作空间" : "未绑定领域插件";
  }
}
