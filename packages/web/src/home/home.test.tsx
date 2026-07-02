import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { nextHomeRoute } from "./home";
import { normalizeActorId } from "./login";
import {
  filterProjects,
  ProjectListBody,
  projectListState,
  projectUpdatedLabel,
  workspaceToProject,
} from "./project-list";
import {
  canAdvance,
  nextWizardStep,
  previousWizardStep,
} from "./new-project-wizard";

describe("home shell", () => {
  it("keeps users on login until an actor id exists", () => {
    expect(nextHomeRoute(null, "projects")).toBe("login");
    expect(nextHomeRoute("actor-1", "login")).toBe("projects");
    expect(normalizeActorId("  alice  ")).toBe("alice");
    expect(normalizeActorId(" ")).toBe("demo-actor");
  });

  it("filters real project cards without local placeholders", () => {
    const projects = [
      workspaceToProject({
        workspaceId: "workspace-techdoc",
        name: "技术方案 Demo",
        templateCode: "technical_proposal",
        updatedAt: "2026-06-26T08:00:00Z",
      }),
      workspaceToProject({
        workspaceId: "workspace-interior",
        name: "室内设计 Demo",
        templateCode: "interior_design",
        updatedAt: "2026-06-26T08:00:00Z",
      }),
    ];

    expect(filterProjects(projects, "技术")).toHaveLength(1);
    expect(filterProjects(projects, "missing")).toHaveLength(0);
  });

  it("renders real workspace projects in the project list", () => {
    const projects = [
      workspaceToProject({
        workspaceId: "workspace-techdoc",
        name: "技术方案 Demo",
        templateCode: "technical_proposal",
        updatedAt: "2026-06-26T08:00:00Z",
      }),
      workspaceToProject({
        workspaceId: "workspace-interior",
        name: "室内设计 Demo",
        templateCode: "interior_design",
        updatedAt: "2026-06-26T08:00:00Z",
      }),
    ];

    const html = renderToStaticMarkup(
      <ProjectListBody
        onCreateProject={() => undefined}
        onOpenProject={() => undefined}
        onRetry={() => undefined}
        projects={projects}
        state="ready"
      />,
    );

    expect(html).toContain("技术方案 Demo");
    expect(html).toContain("室内设计 Demo");
    expect(html).not.toContain("技术方案A");
  });

  it("maps real workspaces to project cards", () => {
    const project = workspaceToProject({
      workspaceId: "workspace-1",
      name: "真实项目",
      templateCode: "interior_design",
      updatedAt: "2026-06-26T08:00:00Z",
    });

    expect(project.workspaceId).toBe("workspace-1");
    expect(project.plugin).toBe("interior_design");
    expect(projectUpdatedLabel(project)).toContain("2026");
  });

  it("uses an explicit failure state instead of fake projects", () => {
    expect(projectListState([], false, true)).toBe("failed");
    expect(projectListState([], false, false)).toBe("empty");
    expect(projectListState([], true, false)).toBe("loading");

    const html = renderToStaticMarkup(
      <ProjectListBody
        onCreateProject={() => undefined}
        onOpenProject={() => undefined}
        onRetry={() => undefined}
        projects={[]}
        state="failed"
      />,
    );

    expect(html).toContain("项目列表读取失败");
    expect(html).toContain("重试");
    expect(html).not.toContain("技术方案A");
  });

  it("advances the new project wizard state machine", () => {
    expect(canAdvance("name", { name: "", profile: "base" })).toBe(false);
    expect(canAdvance("name", { name: "项目", profile: "base" })).toBe(true);
    expect(nextWizardStep("name")).toBe("profile");
    expect(nextWizardStep("profile")).toBe("config");
    expect(nextWizardStep("config")).toBe("create");
    expect(nextWizardStep("create")).toBe("create");
    expect(previousWizardStep("config")).toBe("profile");
  });
});
