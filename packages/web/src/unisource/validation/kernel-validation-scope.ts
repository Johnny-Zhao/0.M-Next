import type { SelectionRef, ViewDef } from "../model/kernel";
import {
  boundedSubtreeDepth,
  resolveUniqueSubtreeRoot,
  traverseObjectSubtree,
} from "../model/object-subtree";
import type { WorkspaceState } from "../state/workspace-store";
import type { KernelValidationPanelConfig } from "./kernel-validation-config";

export interface KernelValidationScope {
  readonly label: string;
  readonly members: ReadonlySet<string>;
  readonly rootObjectId: string;
}

export function resolveKernelValidationScope(
  workspace: Pick<WorkspaceState, "objects" | "relations" | "views">,
  config: KernelValidationPanelConfig,
  selection: SelectionRef | null,
  boundRootObjectId: string | null = null,
): KernelValidationScope | null {
  const view = canvasScopeView(workspace.views, config.scopeCanvasViewId);
  if (!view) return null;
  const rootId = boundRootObjectId
    ? resolveRoot(workspace, boundRootObjectId, view)
    : selectionRoot(workspace, selection, view);
  if (!rootId) return null;
  const subtree = traverseObjectSubtree(
    workspace,
    rootId,
    view.relationTypeCodes,
    view.depth,
  );
  const root = workspace.objects.find((object) => object.id === rootId);
  if (!subtree || !root) return null;
  return {
    rootObjectId: rootId,
    members: subtree.objectIds,
    label: fieldLabel(root),
  };
}

function canvasScopeView(
  views: readonly ViewDef[],
  viewId: string | undefined,
): {
  readonly rootTypeCode: string;
  readonly relationTypeCodes: readonly string[];
  readonly depth: number;
} | null {
  const view = views.find((candidate) => candidate.id === viewId);
  const config = view?.config;
  const rootTypeCode = config?.selectionObjectTypeCode;
  const relationTypeCodes = config?.selectionRelationTypeCodes;
  if (typeof rootTypeCode !== "string" || !Array.isArray(relationTypeCodes)) {
    return null;
  }
  if (!config) return null;
  return {
    rootTypeCode,
    relationTypeCodes: relationTypeCodes.filter(
      (code): code is string => typeof code === "string",
    ),
    depth: boundedSubtreeDepth(Number(config.selectionDepth)),
  };
}

function selectionRoot(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  selection: SelectionRef | null,
  view: NonNullable<ReturnType<typeof canvasScopeView>>,
): string | null {
  if (!selection) return null;
  const objectIds =
    selection.entityType === "relation"
      ? workspace.relations
          .filter((relation) => relation.id === selection.entityId)
          .flatMap((relation) => [relation.sourceId, relation.targetId])
      : [selection.entityId];
  const rootIds = new Set(
    objectIds
      .map((objectId) => resolveRoot(workspace, objectId, view))
      .filter((rootId): rootId is string => rootId !== null),
  );
  return rootIds.size === 1 ? Array.from(rootIds)[0]! : null;
}

function resolveRoot(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  objectId: string,
  view: NonNullable<ReturnType<typeof canvasScopeView>>,
): string | null {
  return resolveUniqueSubtreeRoot(
    workspace,
    objectId,
    view.rootTypeCode,
    view.relationTypeCodes,
    view.depth,
  );
}

function fieldLabel(object: WorkspaceState["objects"][number]): string {
  const name = object.fields.name?.value;
  const code = object.fields.code?.value;
  return typeof name === "string" && name.trim()
    ? name
    : typeof code === "string" && code.trim()
      ? code
      : object.id;
}
