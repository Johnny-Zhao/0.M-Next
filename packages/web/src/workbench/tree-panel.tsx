import { useEffect, useState, type ReactElement } from "react";

import { TreeView, type ViewObject } from "@m-next/views";

import { useWorkbenchContext } from "./workbench";

export const defaultTreeRelationType = "contains";
export const defaultTreeRootObjectType = "floorplan";

export function firstTreeRoot(objects: readonly ViewObject[]): string | null {
  return objects[0]?.objectId ?? null;
}

export function TreePanel(): ReactElement {
  const context = useWorkbenchContext();
  const [autoRootId, setAutoRootId] = useState<string | null>(null);
  const [loadingRoot, setLoadingRoot] = useState(true);

  useEffect(() => {
    let disposed = false;
    async function loadRoot(): Promise<void> {
      setLoadingRoot(true);
      try {
        const page = await context.viewClient.objects(
          context.workspaceId,
          defaultTreeRootObjectType,
          0,
          1,
        );
        if (!disposed) setAutoRootId(firstTreeRoot(page.items));
      } catch {
        if (!disposed) setAutoRootId(null);
      } finally {
        if (!disposed) setLoadingRoot(false);
      }
    }
    void loadRoot();
    return () => {
      disposed = true;
    };
  }, [context.refreshVersion, context.viewClient, context.workspaceId]);

  const effectiveRootId = context.rootId.trim() || autoRootId || "";
  const effectiveRelationType =
    context.rootId.trim() === ""
      ? defaultTreeRelationType
      : context.relationType;

  return (
    <section className="tree-panel" aria-label="模型树面板">
      {loadingRoot ? <p className="view-empty-state">模型树加载中...</p> : null}
      {!loadingRoot ? (
        <TreeView
          client={context.viewClient}
          fallbackObjectType={context.objectType || "room"}
          onError={context.reportError}
          relationType={effectiveRelationType}
          rootId={effectiveRootId}
          selection={context.selection}
          workspaceId={context.workspaceId}
        />
      ) : null}
    </section>
  );
}
