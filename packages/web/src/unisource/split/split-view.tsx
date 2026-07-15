import { useState } from "react";

import { DocView } from "../doc/doc-view";
import { DataGrid } from "../grid/data-grid";
import { GridToolbar } from "../grid/grid-toolbar";
import { IconSync } from "../primitives";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { ChangeLog, deriveChangeLogItems } from "./change-log";

export function SplitView({
  exprId,
  viewId,
}: {
  readonly exprId: string;
  readonly viewId: string;
}) {
  const workspace = useWorkspaceSnapshot();
  const [search, setSearch] = useState("");
  const [hideEol, setHideEol] = useState(false);
  const expression = workspace.expressions.find((item) => item.id === exprId);
  const gridView = workspace.views.find(
    (view) => expression?.viewIds.includes(view.id) && view.kind === "grid",
  );
  const doc = workspace.docModels.find((item) => item.exprId === exprId);
  const boundObject = workspace.objects.find(
    (object) => object.id === doc?.binding.objectId,
  );
  const sourceTypeCode = String(
    gridView?.config.objectTypeCode ?? boundObject?.objectTypeCode ?? "",
  );
  const objectType = workspace.objectTypes.find(
    (type) => type.code === sourceTypeCode,
  );
  const objects = workspace.objects.filter(
    (object) => object.objectTypeCode === sourceTypeCode,
  );
  const logItems = deriveChangeLogItems({
    events: workspace.changeEvents,
    objects: workspace.objects,
    members: workspace.members,
    objectTypeCode: sourceTypeCode,
  });

  if (!objectType) {
    return <p role="status">当前表达未指定可用数据源。</p>;
  }

  return (
    <section className="us-splitview">
      <div className="us-splitview__left">
        <GridToolbar
          hideEol={hideEol}
          onSearch={setSearch}
          onToggleHideEol={() => setHideEol((value) => !value)}
          search={search}
          recordSetLabel={objectType.name}
          searchPlaceholder={`搜索${objectType.name}…`}
        />
        <DataGrid
          compact
          hideEol={hideEol}
          objectType={objectType}
          objects={objects}
          search={search}
        />
        <ChangeLog items={logItems} />
      </div>
      <div className="us-splitview__sync">
        <span>
          <IconSync size={13} />
        </span>
      </div>
      <DocView compact exprId={exprId} viewId={viewId} showDataPanel={false} />
    </section>
  );
}
