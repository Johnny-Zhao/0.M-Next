import { describe, expect, it } from "vitest";

import { nextHomeRoute } from "./home";
import { normalizeActorId } from "./login";
import {
  filterProjects,
  placeholderProjects,
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

  it("filters placeholder projects and exposes an empty state input", () => {
    expect(filterProjects(placeholderProjects, "技术")).toHaveLength(1);
    expect(filterProjects(placeholderProjects, "missing")).toHaveLength(0);
    expect(placeholderProjects[0]?.workspaceId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
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
