import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { DataGrid } from "../grid/data-grid";
import { GridStatusBar } from "../grid/grid-status-bar";
import { GridToolbar } from "../grid/grid-toolbar";
import { buildGridViewModel } from "../grid/grid-view-model";
import { parseFormParam } from "../routes-paths";
import { FormRow, nextFormSearch } from "../shell/form-row";
import { WorkspaceLayout } from "../shell/layouts";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { PageSkeleton } from "./page-skeleton";

export function SourcePage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const [search, setSearch] = useSearchParams();
  const [query, setQuery] = useState("");
  const [hideEol, setHideEol] = useState(false);
  const snapshot = useWorkspaceSnapshot();
  const selection = useSelectionSnapshot();
  const objectType = snapshot.objectTypes.find(
    (type) => type.code === sourceId,
  );
  const objects = snapshot.objects.filter(
    (object) => object.objectTypeCode === objectType?.code,
  );
  const people = snapshot.members.slice(0, 3).map((member) => ({
    member: member.avatar,
    label: member.name.slice(0, 1),
    title: member.name,
  }));
  const form = parseFormParam(search, "grid");
  const focusObjectId = search.get("focus");
  const selectedIds = useMemo(
    () =>
      new Set(
        selection.selected
          .filter((item) => item.entityType === "object")
          .map((item) => item.entityId),
      ),
    [selection.selected],
  );
  const status =
    objectType === undefined
      ? null
      : buildGridViewModel({
          objectType,
          objects,
          selectedIds,
          fieldRefs: snapshot.fieldRefs,
          search: query,
          hideEol,
        }).status;
  useEffect(() => {
    if (!focusObjectId) return;
    selectionStore.set({ entityType: "object", entityId: focusObjectId });
    const element = document.getElementById(`us-row-${focusObjectId}`);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    element?.classList.add("us-row-flash");
    const timer = window.setTimeout(
      () => element?.classList.remove("us-row-flash"),
      1200,
    );
    return () => window.clearTimeout(timer);
  }, [focusObjectId]);
  return (
    <WorkspaceLayout
      sidebarTab="data"
      chrome={{
        breadcrumb: [
          { label: "统一数据源" },
          { label: objectType?.name ?? sourceId ?? "未知库" },
        ],
        sync: {
          state: "ok",
          label: `${objects.length} 条记录 · ${snapshot.fieldRefs.length} 处引用`,
        },
        people,
      }}
      subHeader={
        <FormRow
          activeForm={form}
          forms={["grid"]}
          onFormChange={(next) =>
            setSearch(nextFormSearch(search.toString(), next))
          }
        >
          同一份数据,换任意形式描述
        </FormRow>
      }
    >
      {objectType ? (
        <section className="us-grid-shell">
          <GridToolbar
            hideEol={hideEol}
            onSearch={setQuery}
            onToggleHideEol={() => setHideEol((value) => !value)}
            search={query}
          />
          <DataGrid
            hideEol={hideEol}
            objectType={objectType}
            objects={objects}
            search={query}
          />
          {status ? <GridStatusBar status={status} /> : null}
        </section>
      ) : (
        <PageSkeleton
          kicker="GRID"
          title="找不到数据源"
          desc="请从左侧数据源重新打开。"
        />
      )}
    </WorkspaceLayout>
  );
}
