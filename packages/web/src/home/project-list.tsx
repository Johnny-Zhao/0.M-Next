import { useEffect, useMemo, useState, type ReactElement } from "react";

import type { ViewClient, WorkspaceSummary } from "@m-next/views";

export interface ProjectSummary {
  readonly workspaceId: string;
  readonly name: string;
  readonly plugin: string;
  readonly role: string;
  readonly alertCount: number;
  readonly templateCode?: string | null;
  readonly updatedAt?: string;
}

export function filterProjects(
  projects: readonly ProjectSummary[],
  query: string,
): readonly ProjectSummary[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return projects;
  return projects.filter((project) =>
    `${project.name} ${project.plugin} ${project.role}`
      .toLowerCase()
      .includes(normalized),
  );
}

export function projectHealth(project: ProjectSummary): "ok" | "warn" | "bad" {
  if (project.alertCount === 0) return "ok";
  return project.alertCount > 2 ? "bad" : "warn";
}

export function workspaceToProject(
  workspace: WorkspaceSummary,
): ProjectSummary {
  return {
    workspaceId: workspace.workspaceId,
    name: workspace.name,
    plugin: workspace.templateCode ?? "未绑定模板",
    role: "工作空间",
    alertCount: 0,
    templateCode: workspace.templateCode,
    updatedAt: workspace.updatedAt,
  };
}

export function projectUpdatedLabel(project: ProjectSummary): string {
  if (!project.updatedAt) return "更新时间未知";
  const date = new Date(project.updatedAt);
  if (Number.isNaN(date.getTime())) return "更新时间未知";
  return `更新 ${date.toLocaleDateString("zh-CN")}`;
}

export type ProjectListState = "loading" | "failed" | "empty" | "ready";

export function projectListState(
  projects: readonly ProjectSummary[],
  loading: boolean,
  failed: boolean,
): ProjectListState {
  if (loading) return "loading";
  if (failed) return "failed";
  return projects.length === 0 ? "empty" : "ready";
}

export interface ProjectListProps {
  readonly actorId: string | null;
  readonly viewClient: ViewClient;
  readonly onOpenProject: (project: ProjectSummary) => void;
  readonly onCreateProject: () => void;
}

export interface ProjectListBodyProps {
  readonly state: ProjectListState;
  readonly projects: readonly ProjectSummary[];
  readonly onOpenProject: (project: ProjectSummary) => void;
  readonly onCreateProject: () => void;
  readonly onRetry: () => void;
}

export function ProjectList({
  actorId,
  onCreateProject,
  onOpenProject,
  viewClient,
}: ProjectListProps): ReactElement {
  const [query, setQuery] = useState("");
  const [remoteProjects, setRemoteProjects] = useState<
    readonly ProjectSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setFailed(false);
    void viewClient
      .workspaces()
      .then((workspaces) => {
        if (disposed) return;
        setRemoteProjects(workspaces.map(workspaceToProject));
        setFailed(false);
      })
      .catch(() => {
        if (disposed) return;
        setRemoteProjects([]);
        setFailed(true);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [actorId, reloadKey, viewClient]);
  const projects = useMemo(
    () => filterProjects(remoteProjects, query),
    [query, remoteProjects],
  );
  const state = projectListState(projects, loading, failed);

  return (
    <section className="home-shell project-list" aria-label="项目列表">
      <header className="home-header">
        <div>
          <strong>M-Next</strong>
          <h1>项目</h1>
          <p>
            {actorId} ·{" "}
            {loading
              ? "正在读取工作空间"
              : failed
                ? "项目列表读取失败"
                : `${projects.length} 个工作空间`}
          </p>
        </div>
        <button onClick={onCreateProject} type="button">
          新建项目
        </button>
      </header>
      <label className="project-search">
        搜索
        <input
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="项目、插件或角色"
          value={query}
        />
      </label>
      <ProjectListBody
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
        onRetry={() => setReloadKey((value) => value + 1)}
        projects={projects}
        state={state}
      />
    </section>
  );
}

export function ProjectListBody({
  state,
  projects,
  onCreateProject,
  onOpenProject,
  onRetry,
}: ProjectListBodyProps): ReactElement {
  return (
    <>
      {state === "loading" ? (
        <div className="empty-projects" role="status">
          <h2>正在读取项目</h2>
          <p>请稍候。</p>
        </div>
      ) : null}
      {state === "failed" ? (
        <div className="empty-projects" role="alert">
          <h2>项目列表读取失败</h2>
          <p>请确认服务已启动后重试。</p>
          <button onClick={onRetry} type="button">
            重试
          </button>
        </div>
      ) : null}
      {state === "empty" ? (
        <div className="empty-projects">
          <h2>还没有项目</h2>
          <p>创建一个项目后即可进入制图工作台。</p>
          <button onClick={onCreateProject} type="button">
            新建项目
          </button>
        </div>
      ) : null}
      {state === "ready" ? (
        <div className="project-grid">
          {projects.map((project) => (
            <button
              className="project-card"
              key={project.workspaceId}
              onClick={() => onOpenProject(project)}
              type="button"
            >
              <span className="project-card-head">
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.plugin}</small>
                </span>
                <span className="project-plugin-tag">{project.role}</span>
              </span>
              <span className="project-card-meta">
                <span>所属插件</span>
                <strong>{project.plugin}</strong>
              </span>
              <span className="project-card-foot">
                <span>{projectUpdatedLabel(project)}</span>
                <ProjectHealthDot
                  alertCount={project.alertCount}
                  tone={projectHealth(project)}
                />
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ProjectHealthDot({
  alertCount,
  tone,
}: {
  readonly alertCount: number;
  readonly tone: "ok" | "warn" | "bad";
}): ReactElement {
  const label =
    tone === "ok"
      ? "健康"
      : tone === "warn"
        ? `${alertCount} 告警`
        : `${alertCount} 红线`;
  const glyph = tone === "ok" ? "✓" : tone === "warn" ? "!" : "×";
  return (
    <span
      aria-label={`规则健康度 ${label}`}
      className={`project-health-dot project-health-${tone}`}
    >
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  );
}
