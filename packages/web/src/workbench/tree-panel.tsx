import { type ReactElement } from "react";

import { TreeView } from "@m-next/views";

import { useWorkbenchContext } from "./workbench";

export function TreePanel(): ReactElement {
  const context = useWorkbenchContext();
  return (
    <section className="tree-panel" aria-label="模型树面板">
      <TreeView
        client={context.viewClient}
        relationType={context.relationType}
        rootId={context.rootId}
        selection={context.selection}
        workspaceId={context.workspaceId}
      />
    </section>
  );
}
