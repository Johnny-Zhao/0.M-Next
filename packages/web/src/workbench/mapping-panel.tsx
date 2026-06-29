import { MappingView } from "@m-next/views";
import type { ReactElement } from "react";

import { useWorkbenchContext } from "./workbench";

export function MappingPanel(): ReactElement {
  const { refreshVersion, reportError, selection, viewClient, workspaceId } =
    useWorkbenchContext();

  return (
    <MappingView
      onError={reportError}
      refreshKey={refreshVersion}
      selection={selection}
      viewClient={viewClient}
      workspaceId={workspaceId}
    />
  );
}
