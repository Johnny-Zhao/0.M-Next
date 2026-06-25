import { MatrixView } from "@m-next/views";
import type { ReactElement } from "react";

import { useWorkbenchContext } from "./workbench";

/**
 * 矩阵视图面板:复用 @m-next/views 的 MatrixView。行列类型默认取当前对象类型,
 * 关系类型取工作台关系类型(行列同型的自关系矩阵)。
 */
export function MatrixPanel(): ReactElement {
  const context = useWorkbenchContext();
  return (
    <div className="matrix-panel">
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
