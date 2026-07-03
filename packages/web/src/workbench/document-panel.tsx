import { DocumentView } from "@m-next/views";
import { useEffect, useState, type ReactElement } from "react";

import { useWorkbenchContext } from "./workbench";

/**
 * 文档视图面板:复用 @m-next/views 的 DocumentView。沿关系类型从根对象展开为
 * 文档大纲;数据/选择联动取自工作台上下文,字段编辑后刷新视图。
 */
export function DocumentPanel(): ReactElement {
  const context = useWorkbenchContext();
  const [warming, setWarming] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setWarming(false), 160);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="document-panel">
      {warming ? <PanelSkeleton label="文档加载中" /> : null}
      <DocumentView
        commandClient={context.commandClient}
        onArchived={context.refreshViews}
        onEditField={context.refreshViews}
        onError={context.reportError}
        relationType={context.relationType}
        rootId={context.rootId}
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
