import { TableView } from "@m-next/views";
import type { ReactElement } from "react";

import { useWorkbenchContext } from "./workbench";

/** 表格视图面板:复用 @m-next/views 的 TableView,数据/选择联动取自工作台上下文。 */
export function TablePanel(): ReactElement {
  const context = useWorkbenchContext();
  return (
    <div className="table-panel">
      <TableView
        commandClient={context.commandClient}
        objectType={context.objectType}
        onError={context.reportError}
        selection={context.selection}
        viewClient={context.viewClient}
        workspaceId={context.workspaceId}
      />
    </div>
  );
}
