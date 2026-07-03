import { TableView } from "@m-next/views";
import { useEffect, useState, type ReactElement } from "react";

import { useWorkbenchContext } from "./workbench";

/** 表格视图面板:复用 @m-next/views 的 TableView,数据/选择联动取自工作台上下文。 */
export function TablePanel(): ReactElement {
  const context = useWorkbenchContext();
  const [warming, setWarming] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setWarming(false), 160);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="table-panel">
      {warming ? <PanelSkeleton label="表格加载中" /> : null}
      <TableView
        commandClient={context.commandClient}
        objectType={context.objectType}
        onError={context.reportError}
        onSaved={() => void context.autoCheckAfterSave()}
        selection={context.selection}
        viewClient={context.viewClient}
        workspaceId={context.workspaceId}
      />
    </div>
  );
}

function PanelSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div className="panel-skeleton" role="status">
      <span>{label}</span>
      <i />
      <i />
      <i />
    </div>
  );
}
