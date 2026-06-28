import { useCallback, useState, type ReactElement } from "react";

import type { CommandClient, ViewClient } from "@m-next/views";

import "./home.css";
import { CapabilityCatalog } from "./capability-catalog";
import { Login } from "./login";
import { NewProjectWizard, type ProjectDraft } from "./new-project-wizard";
import {
  ProjectList,
  placeholderProjects,
  type ProjectSummary,
} from "./project-list";

export type HomeRoute = "login" | "projects" | "new-project";

export interface HomeProps {
  readonly actorId: string | null;
  readonly viewClient: ViewClient;
  readonly commandClient: CommandClient;
  readonly onLogin: (actorId: string) => void;
  readonly onOpenWorkspace: (workspaceId: string) => void;
}

export function nextHomeRoute(
  actorId: string | null,
  route: HomeRoute,
): HomeRoute {
  if (!actorId) return "login";
  return route === "login" ? "projects" : route;
}

export function Home({
  actorId,
  commandClient,
  onLogin,
  onOpenWorkspace,
  viewClient,
}: HomeProps): ReactElement {
  const [route, setRoute] = useState<HomeRoute>(() =>
    nextHomeRoute(actorId, "login"),
  );
  const [projectListKey, setProjectListKey] = useState(0);
  const [homeError, setHomeError] = useState("");
  const effectiveRoute = nextHomeRoute(actorId, route);

  const reportError = useCallback((message: string): void => {
    setHomeError(message || "操作失败");
  }, []);

  const refreshProjects = useCallback((): void => {
    setProjectListKey((value) => value + 1);
    setHomeError("");
  }, []);

  if (effectiveRoute === "login") {
    return <Login onLogin={onLogin} />;
  }

  function openDraft(draft: ProjectDraft): void {
    const fallback = placeholderProjects[0] ?? {
      workspaceId: "11111111-1111-4111-8111-111111111111",
    };
    onOpenWorkspace(draft.workspaceId ?? fallback.workspaceId);
  }

  if (effectiveRoute === "new-project") {
    return (
      <NewProjectWizard
        commandClient={commandClient}
        onCancel={() => setRoute("projects")}
        onCreated={openDraft}
        viewClient={viewClient}
      />
    );
  }

  return (
    <main className="home-dashboard" aria-label="项目首页">
      {homeError ? (
        <p className="home-error" role="alert">
          {homeError}
        </p>
      ) : null}
      <ProjectList
        actorId={actorId}
        key={projectListKey}
        onCreateProject={() => setRoute("new-project")}
        onOpenProject={(project: ProjectSummary) =>
          onOpenWorkspace(project.workspaceId)
        }
        viewClient={viewClient}
      />
      <CapabilityCatalog
        commandClient={commandClient}
        onCreated={refreshProjects}
        reportError={reportError}
        viewClient={viewClient}
      />
    </main>
  );
}
