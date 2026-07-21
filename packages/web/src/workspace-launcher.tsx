import { useEffect, useMemo, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CommandClient,
  ViewClient,
  type TemplateCatalogItem,
  type WorkspaceSummary,
} from "@m-next/views";

import "./unisource/us-tokens.css";
import "./unisource/us-components.css";
import { UsLogoMark } from "./unisource/shell/logo";

const workspaceClient = new ViewClient("");
const workspaceCommandClient = new CommandClient("");
workspaceCommandClient.setActorId("wangyun");

type LauncherViewClient = Pick<ViewClient, "templates" | "workspaces">;
type LauncherCommandClient = Pick<CommandClient, "instantiateWorkspace">;

export function renderWorkspaceLauncher(
  element: HTMLElement | null,
): Root | null {
  if (!element) return null;
  const root = createRoot(element);
  root.render(<WorkspaceLauncher />);
  return root;
}

export function WorkspaceLauncher({
  commandClient = workspaceCommandClient,
  navigate = (location) => window.location.assign(location),
  viewClient = workspaceClient,
}: {
  readonly commandClient?: LauncherCommandClient;
  readonly navigate?: (location: string) => void;
  readonly viewClient?: LauncherViewClient;
}): ReactElement {
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceSummary[]>([]);
  const [templates, setTemplates] = useState<readonly TemplateCatalogItem[]>(
    [],
  );
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [templateState, setTemplateState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    void viewClient
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
  }, [viewClient]);

  useEffect(() => {
    let active = true;
    void viewClient
      .templates()
      .then((items) => {
        if (!active) return;
        setTemplates(items);
        setSelectedTemplateId(
          (current) => current || items[0]?.templateId || "",
        );
        setTemplateState("ready");
      })
      .catch(() => {
        if (active) setTemplateState("error");
      });
    return () => {
      active = false;
    };
  }, [viewClient]);

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
        onOpen={(workspace) =>
          navigate(workspaceLaunchLocation(workspace.workspaceId))
        }
        state={state}
        workspaces={filtered}
      />
      <section
        aria-label="从模板新建工作空间"
        className="us-workspace-launcher__templates"
      >
        <div className="us-workspace-launcher__section-heading">
          <div>
            <span className="us-data">TEMPLATES</span>
            <h2>从模板新建工作空间</h2>
          </div>
          <button
            className="us-btn us-btn--secondary"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
            type="button"
          >
            新建工作空间
          </button>
        </div>
        <TemplateBody
          onSelect={(template) => {
            setSelectedTemplateId(template.templateId);
            setCreateError(null);
            setCreateOpen(true);
          }}
          state={templateState}
          templates={templates}
        />
        {createOpen ? (
          <form
            className="us-workspace-launcher__create"
            onSubmit={(event) => {
              event.preventDefault();
              if (creating) return;
              const template = templates.find(
                (item) => item.templateId === selectedTemplateId,
              );
              if (!workspaceName.trim() || !template) {
                setCreateError(
                  "\u8bf7\u586b\u5199\u5de5\u4f5c\u7a7a\u95f4\u540d\u79f0\u5e76\u9009\u62e9\u6a21\u677f\u3002",
                );
                return;
              }
              setCreating(true);
              setCreateError(null);
              void instantiateWorkspaceFromTemplate({
                commandClient,
                name: workspaceName,
                template,
              })
                .then((workspaceId) => {
                  navigate(workspaceLaunchLocation(workspaceId));
                })
                .catch((error: unknown) => {
                  setCreateError(
                    error instanceof Error
                      ? error.message
                      : "\u5de5\u4f5c\u7a7a\u95f4\u521b\u5efa\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
                  );
                })
                .finally(() => setCreating(false));
            }}
          >
            <label>
              工作空间名称
              <input
                autoFocus
                onChange={(event) =>
                  setWorkspaceName(event.currentTarget.value)
                }
                required
                value={workspaceName}
              />
            </label>
            <label>
              模板
              <select
                onChange={(event) =>
                  setSelectedTemplateId(event.currentTarget.value)
                }
                required
                value={selectedTemplateId}
              >
                <option disabled value="">
                  请选择模板
                </option>
                {templates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="us-workspace-launcher__template-description">
              {templates.find((item) => item.templateId === selectedTemplateId)
                ?.description || "该模板未提供额外说明。"}
            </p>
            {createError ? (
              <p className="us-workspace-launcher__status" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="us-workspace-launcher__create-actions">
              <button
                className="us-btn"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="us-btn us-btn--primary"
                disabled={creating}
                type="submit"
              >
                {creating ? "创建中…" : "创建工作空间"}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}

export function workspaceLaunchLocation(workspaceId: string): string {
  const query = new URLSearchParams({ backend: "1", ws: workspaceId });
  return `/us/home?${query.toString()}`;
}

export function publishedTemplateVersion(
  template: TemplateCatalogItem,
): number {
  return template.latestPublishedVersion > 0
    ? template.latestPublishedVersion
    : template.version;
}

export async function instantiateWorkspaceFromTemplate({
  commandClient,
  name,
  template,
  newWorkspaceId = crypto.randomUUID(),
}: {
  readonly commandClient: LauncherCommandClient;
  readonly name: string;
  readonly template: TemplateCatalogItem;
  readonly newWorkspaceId?: string;
}): Promise<string> {
  const workspaceName = name.trim();
  if (!workspaceName) throw new Error("请输入工作空间名称。");
  await commandClient.instantiateWorkspace(
    newWorkspaceId,
    template.templateId,
    publishedTemplateVersion(template),
    workspaceName,
  );
  return newWorkspaceId;
}

export function LauncherBody({
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
            <small>更新于 {workspace.updatedAt}</small>
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

export function TemplateBody({
  onSelect,
  state,
  templates,
}: {
  readonly onSelect: (template: TemplateCatalogItem) => void;
  readonly state: "loading" | "ready" | "error";
  readonly templates: readonly TemplateCatalogItem[];
}): ReactElement {
  if (state === "loading") {
    return <p className="us-workspace-launcher__status">正在读取模板…</p>;
  }
  if (state === "error") {
    return (
      <p className="us-workspace-launcher__status" role="alert">
        模板列表读取失败，请确认后端服务已启动。
      </p>
    );
  }
  if (templates.length === 0) {
    return <p className="us-workspace-launcher__status">当前没有可用模板。</p>;
  }
  return (
    <div className="us-workspace-launcher__template-grid">
      {templates.map((template) => (
        <button
          className="us-workspace-launcher__template-card"
          key={template.templateId}
          onClick={() => onSelect(template)}
          type="button"
        >
          <strong>{template.name}</strong>
          <small>{template.code}</small>
          <small>{template.description || "该模板未提供额外说明。"}</small>
          <em>版本 {publishedTemplateVersion(template)}</em>
        </button>
      ))}
    </div>
  );
}

function templateLabel(code: string | null): string {
  return code || "\u672a\u7ed1\u5b9a\u6a21\u677f";
}
