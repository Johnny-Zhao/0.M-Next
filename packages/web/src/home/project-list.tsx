import { useMemo, useState, type ReactElement } from "react";

import type { ViewClient } from "@m-next/views";

export interface ProjectSummary {
  readonly workspaceId: string;
  readonly name: string;
  readonly plugin: string;
  readonly role: string;
  readonly alertCount: number;
}

export const placeholderProjects: readonly ProjectSummary[] = [
  {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    name: "技术方案A",
    plugin: "制图工作台",
    role: "Owner",
    alertCount: 0,
  },
];

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

export interface ProjectListProps {
  readonly actorId: string | null;
  readonly viewClient: ViewClient;
  readonly onOpenProject: (project: ProjectSummary) => void;
  readonly onCreateProject: () => void;
}

export function ProjectList({
  actorId,
  onCreateProject,
  onOpenProject,
}: ProjectListProps): ReactElement {
  const [query, setQuery] = useState("");
  const projects = useMemo(
    () => filterProjects(placeholderProjects, query),
    [query],
  );

  return (
    <section className="home-shell project-list" aria-label="项目列表">
      <header className="home-header">
        <div>
          <strong>M-Next</strong>
          <h1>项目</h1>
          <p>{actorId} · TODO(view-API): 工作空间列表未提供</p>
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
      {projects.length === 0 ? (
        <div className="empty-projects">
          <h2>还没有项目</h2>
          <p>创建一个项目后即可进入制图工作台。</p>
          <button onClick={onCreateProject} type="button">
            新建项目
          </button>
        </div>
      ) : (
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
                <span>更新 2026-06-26</span>
                <ProjectHealthDot
                  alertCount={project.alertCount}
                  tone={projectHealth(project)}
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
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
