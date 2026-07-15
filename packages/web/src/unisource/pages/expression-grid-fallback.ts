import type { ViewDef } from "../model/kernel";
import type { WorkspaceState } from "../state/workspace-store";

type GridFallbackState = Pick<WorkspaceState, "objectTypes" | "views">;

export function resolveExpressionGridFallback(
  workspace: GridFallbackState,
  view: ViewDef,
): string | null | undefined {
  if (view.kind !== "grid" || view.config.sourceFallback !== true) {
    return undefined;
  }
  const configured = view.config.objectTypeCode;
  if (
    typeof configured === "string" &&
    workspace.objectTypes.some((type) => type.code === configured)
  ) {
    return configured;
  }
  return workspace.objectTypes[0]?.code ?? null;
}
