import type { WorkspaceState } from "../state/workspace-store";

type GridFallbackState = Pick<WorkspaceState, "objectTypes" | "views">;

export function resolveExpressionGridFallback(
  workspace: GridFallbackState,
  exprId: string,
): string | null | undefined {
  const view = workspace.views.find(
    (candidate) =>
      candidate.exprId === exprId &&
      candidate.kind === "grid" &&
      candidate.config.sourceFallback === true,
  );
  if (!view) return undefined;
  const configured = view.config.objectTypeCode;
  if (
    typeof configured === "string" &&
    workspace.objectTypes.some((type) => type.code === configured)
  ) {
    return configured;
  }
  return workspace.objectTypes[0]?.code ?? null;
}
