import { useState } from "react";

import { DocView } from "../doc/doc-view";
import { DataGrid } from "../grid/data-grid";
import { GridToolbar } from "../grid/grid-toolbar";
import { IconSync } from "../primitives";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { ChangeLog, deriveChangeLogItems } from "./change-log";

const PRODUCT_TYPE = "product_specs";

export function SplitView({ exprId }: { readonly exprId: string }) {
  const workspace = useWorkspaceSnapshot();
  const [search, setSearch] = useState("");
  const [hideEol, setHideEol] = useState(false);
  const objectType = workspace.objectTypes.find(
    (type) => type.code === PRODUCT_TYPE,
  );
  const objects = workspace.objects.filter(
    (object) => object.objectTypeCode === PRODUCT_TYPE,
  );
  const logItems = deriveChangeLogItems({
    events: workspace.changeEvents,
    objects: workspace.objects,
    members: workspace.members,
    objectTypeCode: PRODUCT_TYPE,
  });

  if (!objectType) return null;

  return (
    <section className="us-splitview">
      <div className="us-splitview__left">
        <GridToolbar
          hideEol={hideEol}
          onSearch={setSearch}
          onToggleHideEol={() => setHideEol((value) => !value)}
          search={search}
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
      <DocView compact exprId={exprId} showDataPanel={false} />
    </section>
  );
}
