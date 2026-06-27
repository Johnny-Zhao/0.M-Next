import { MatrixView } from "@m-next/views";
import { useEffect, useState, type ReactElement } from "react";

import { useWorkbenchContext } from "./workbench";

/**
 * 矩阵视图面板:复用 @m-next/views 的 MatrixView。行列类型默认取当前对象类型,
 * 关系类型取工作台关系类型(行列同型的自关系矩阵)。
 */
export function MatrixPanel(): ReactElement {
  const context = useWorkbenchContext();
  const [warming, setWarming] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setWarming(false), 160);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="matrix-panel">
      {warming ? <PanelSkeleton label="矩阵加载中" /> : null}
      <MatrixView
        colType={context.objectType}
        commandClient={context.commandClient}
        onError={context.reportError}
        relationType={context.relationType}
        rowType={context.objectType}
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
