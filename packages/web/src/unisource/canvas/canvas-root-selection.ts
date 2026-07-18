import { useEffect, useState } from "react";

import type { ViewDef } from "../model/kernel";
import type { WorkspaceState } from "../state/workspace-store";
import {
  initialCanvasRootObjectId,
  selectedCanvasRootObjectId,
} from "./canvas-view-model";

/** Keeps a selection-derived canvas rooted until another root object is selected. */
export function useCanvasRootObjectId(
  workspace: WorkspaceState,
  view: ViewDef | undefined,
  selectedObjectId: string | null,
): string | null {
  const initialRootObjectId = view
    ? initialCanvasRootObjectId(workspace, view)
    : null;
  const selectedRootObjectId = view
    ? selectedCanvasRootObjectId(workspace, view, selectedObjectId)
    : null;
  const [canvasRootObjectId, setCanvasRootObjectId] =
    useState(initialRootObjectId);

  useEffect(() => {
    setCanvasRootObjectId((current) => {
      if (!view) return null;
      if (selectedRootObjectId !== null) return selectedRootObjectId;
      return selectedCanvasRootObjectId(workspace, view, current) !== null
        ? current
        : initialRootObjectId;
    });
  }, [initialRootObjectId, selectedRootObjectId, view, workspace]);

  return canvasRootObjectId;
}
