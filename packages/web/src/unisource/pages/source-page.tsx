import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { DataGrid } from "../grid/data-grid";
import { createRecordAvailability } from "../grid/create-record-action";
import {
  CreateRecordDialog,
  EditRecordDialog,
} from "../grid/create-record-dialog";
import { GridStatusBar } from "../grid/grid-status-bar";
import { GridToolbar } from "../grid/grid-toolbar";
import { buildGridViewModel } from "../grid/grid-view-model";
import { parseFormParam } from "../routes-paths";
import { DataSourceCreateActionOutlet } from "../presentation/data-source-create-action-registry";
import { DataSourceRelationActionOutlet } from "../presentation/data-source-relation-action-registry";
import { FormRow, nextFormSearch } from "../shell/form-row";
import { WorkspaceLayout } from "../shell/layouts";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import { sessionStore, useSessionSnapshot } from "../state/session-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { useKernelRuntimeState } from "../data/boot-mode";
import { PageSkeleton } from "./page-skeleton";

export function SourcePage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const [search, setSearch] = useSearchParams();
  const [query, setQuery] = useState("");
  const [hideEol, setHideEol] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createdObjectId, setCreatedObjectId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const snapshot = useWorkspaceSnapshot();
  const runtime = useKernelRuntimeState();
  const session = useSessionSnapshot();
  const selection = useSelectionSnapshot();
  const objectType = snapshot.objectTypes.find(
    (type) => type.code === sourceId,
  );
  const objects = snapshot.objects.filter(
    (object) => object.objectTypeCode === objectType?.code,
  );
  const createAvailability = objectType
    ? createRecordAvailability(objectType, snapshot.relationTypes)
    : { available: false, reason: null };
  const canCreate =
    objectType !== undefined &&
    sessionStore.can(session.currentMemberId, objectType.code, "editData");
  const createDisabledReason = !createAvailability.available
    ? createAvailability.reason
    : canCreate
      ? null
      : "当前成员没有新建记录权限";
  const selectedObjectIds = useMemo(() => {
    const objectIds = new Set(objects.map((object) => object.id));
    return new Set(
      selection.selected
        .filter(
          (item) =>
            (item.entityType === "object" || item.entityType === "field") &&
            objectIds.has(item.entityId),
        )
        .map((item) => item.entityId),
    );
  }, [objects, selection.selected]);
  const selectedObject =
    selectedObjectIds.size === 1
      ? objects.find((object) => selectedObjectIds.has(object.id))
      : undefined;
  const createdObject = createdObjectId
    ? snapshot.objects.find((object) => object.id === createdObjectId)
    : undefined;
  const hasEditableFields =
    objectType?.fields.some((field) => !field.computed && !field.readOnly) ??
    false;
  const editDisabledReason =
    selectedObjectIds.size === 0
      ? "请选择一条记录"
      : selectedObjectIds.size > 1
        ? "一次只能编辑一条记录"
        : !hasEditableFields
          ? "当前记录没有可编辑字段"
          : selectedObject &&
              ["archived", "deleted", "soft-deleted"].includes(
                selectedObject.status,
              )
            ? "当前记录已归档，不能编辑"
            : null;
  const people = snapshot.members.slice(0, 3).map((member) => ({
    member: member.avatar,
    label: member.name.slice(0, 1),
    title: member.name,
  }));
  const form = parseFormParam(search, "grid");
  const focusObjectId = search.get("focus");
  const maskValues =
    objectType !== undefined &&
    !sessionStore.can(session.currentMemberId, objectType.code, "read");
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
          search: maskValues ? "" : query,
          hideEol,
          status: statusFilter as (typeof objects)[number]["status"] | "all",
          maskValues,
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
            createDisabled={createDisabledReason !== null}
            createDisabledReason={createDisabledReason ?? undefined}
            hideEol={hideEol}
            onCreate={() => setCreateOpen(true)}
            onEdit={() => setEditOpen(true)}
            onSearch={setQuery}
            onStatusChange={setStatusFilter}
            onToggleHideEol={() => setHideEol((value) => !value)}
            editDisabled={editDisabledReason !== null}
            editDisabledReason={editDisabledReason ?? undefined}
            search={query}
            recordSetLabel={objectType.name}
            status={statusFilter}
            searchPlaceholder={`搜索${objectType.name}…`}
          />
          {selectedObject ? (
            <DataSourceRelationActionOutlet
              object={selectedObject}
              objectType={objectType}
              onCompleted={(objectId) =>
                selectionStore.set({ entityType: "object", entityId: objectId })
              }
              templateCode={runtime.templateCode}
            />
          ) : null}
          {maskValues ? (
            <div className="us-grid-masknotice">
              字段值按你的数据源权限脱敏显示。
            </div>
          ) : null}
          <DataGrid
            createDisabled={createDisabledReason !== null}
            createDisabledReason={createDisabledReason ?? undefined}
            hideEol={hideEol}
            maskValues={maskValues}
            objectType={objectType}
            objects={objects}
            onCreate={() => setCreateOpen(true)}
            search={maskValues ? "" : query}
          />
          {status ? <GridStatusBar status={status} /> : null}
          <CreateRecordDialog
            objectType={objectType}
            onClose={() => setCreateOpen(false)}
            onCreated={(objectId) => {
              setCreatedObjectId(objectId);
              selectionStore.set({ entityType: "object", entityId: objectId });
              setSearch((current) => {
                const next = new URLSearchParams(current);
                next.set("focus", objectId);
                return next;
              });
            }}
            open={createOpen}
            relationTypes={snapshot.relationTypes}
          />
          {createdObject ? (
            <DataSourceCreateActionOutlet
              object={createdObject}
              objectType={objectType}
              onClose={() => setCreatedObjectId(null)}
              onCompleted={(objectId) => {
                selectionStore.set({
                  entityType: "object",
                  entityId: objectId,
                });
                setCreatedObjectId(null);
              }}
              templateCode={runtime.templateCode}
            />
          ) : null}
          {selectedObject ? (
            <EditRecordDialog
              object={selectedObject}
              objectType={objectType}
              onClose={() => setEditOpen(false)}
              onUpdated={() => {
                selectionStore.set({
                  entityType: "object",
                  entityId: selectedObject.id,
                });
              }}
              open={editOpen}
            />
          ) : null}
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
