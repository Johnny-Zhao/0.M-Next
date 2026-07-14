import { useEffect, useMemo } from "react";

import { useKernelRuntimeState } from "../data/boot-mode";
import type { Lineage, LineageEntry } from "../data/gateway";
import type { DataObject, FieldCode, SelectionRef } from "../model/kernel";
import type { FieldRef } from "../model/view-layer";
import { UsDrawer, UsMonoTag } from "../primitives";
import { lineageStore, useLineageSnapshot } from "../state/lineage-store";
import { useSessionSnapshot } from "../state/session-store";
import {
  useWorkspaceSnapshot,
  type WorkspaceState,
} from "../state/workspace-store";

export function LineageDrawer({
  open,
  onClose,
  target,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly target?: SelectionRef | null;
}) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const kernelRuntime = useKernelRuntimeState();
  const lineageState = useLineageSnapshot();
  const fieldTarget = target?.entityType === "field" ? target : null;
  const targetKey = fieldTarget
    ? `${fieldTarget.entityId}:${fieldTarget.fieldCode ?? ""}`
    : "";

  useEffect(() => {
    if (!open || !kernelRuntime.backend || !fieldTarget?.fieldCode) return;
    void lineageStore.refresh(
      fieldTarget.entityId,
      fieldTarget.fieldCode,
      session.currentMemberId,
    );
  }, [
    fieldTarget,
    kernelRuntime.backend,
    open,
    session.currentMemberId,
    targetKey,
  ]);

  const localLineage = useMemo(
    () => (fieldTarget ? localReferenceLineage(workspace, fieldTarget) : null),
    [fieldTarget, workspace],
  );
  const kernelLineage =
    fieldTarget &&
    lineageState.kernelLineage?.objectId === fieldTarget.entityId &&
    lineageState.kernelLineage.fieldCode === fieldTarget.fieldCode
      ? lineageState.kernelLineage
      : null;
  const lineage = kernelRuntime.backend ? kernelLineage : localLineage;
  const targetLabel = fieldTarget
    ? describeField(workspace, fieldTarget.entityId, fieldTarget.fieldCode)
    : "未选择字段";

  return (
    <UsDrawer
      headerExtra={
        <UsMonoTag active={kernelRuntime.backend}>LINEAGE</UsMonoTag>
      }
      onClose={onClose}
      open={open}
      title="字段血缘"
    >
      <section className="us-lineage">
        <header className="us-lineage__target">
          <span>
            <small>当前字段</small>
            <strong>{targetLabel}</strong>
          </span>
          <UsMonoTag>{kernelRuntime.backend ? "KERNEL" : "MOCK"}</UsMonoTag>
        </header>

        {!fieldTarget ? (
          <p className="us-lineage__empty">
            请选择表格字段或字段引用后查看血缘。
          </p>
        ) : lineageState.busy && kernelRuntime.backend && !lineage ? (
          <p className="us-lineage__empty">正在读取内核血缘...</p>
        ) : lineage ? (
          <>
            <AlgorithmBadge lineage={lineage} backend={kernelRuntime.backend} />
            {lineage.partial || lineage.truncated ? (
              <p className="us-lineage__notice">
                {lineage.partial ? "数据不完整" : null}
                {lineage.partial && lineage.truncated ? " · " : null}
                {lineage.truncated ? "结果已截断" : null}
              </p>
            ) : null}
            <LineageLane
              emptyLabel="暂无上游。"
              entries={lineage.upstream}
              title="上游 · 此字段派生自"
              workspace={workspace}
            />
            <LineageAnchor label={targetLabel} />
            <LineageLane
              emptyLabel={
                kernelRuntime.backend ? "暂无下游依赖。" : "暂无本地文档引用。"
              }
              entries={lineage.downstream}
              title="下游 · 依赖此字段"
              workspace={workspace}
            />
          </>
        ) : (
          <p className="us-lineage__empty">当前字段暂无血缘数据。</p>
        )}
      </section>
    </UsDrawer>
  );
}

function AlgorithmBadge({
  lineage,
  backend,
}: {
  readonly lineage: Lineage;
  readonly backend: boolean;
}) {
  return (
    <div className="us-lineage__algorithm">
      <UsMonoTag tone={algorithmTone(lineage.algorithm.kind)}>
        {algorithmLabel(lineage.algorithm.kind)}
      </UsMonoTag>
      <span>{backend ? lineage.algorithm.ref : "本地引用"}</span>
    </div>
  );
}

function LineageLane({
  title,
  entries,
  emptyLabel,
  workspace,
}: {
  readonly title: string;
  readonly entries: readonly LineageEntry[];
  readonly emptyLabel: string;
  readonly workspace: WorkspaceState;
}) {
  const groups = groupByDepth(entries);
  return (
    <section className="us-lineage-lane">
      <header>{title}</header>
      {groups.length === 0 ? (
        <p>{emptyLabel}</p>
      ) : (
        groups.map(([depth, nodes]) => (
          <div className="us-lineage-level" key={depth}>
            <span className="us-data">depth {depth}</span>
            <div>
              {nodes.map((node, index) => (
                <LineageNodeCard
                  key={`${node.kind}-${node.objectId ?? node.ref ?? index}-${node.fieldCode ?? ""}`}
                  node={node}
                  workspace={workspace}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function LineageNodeCard({
  node,
  workspace,
}: {
  readonly node: LineageEntry;
  readonly workspace: WorkspaceState;
}) {
  return (
    <article className="us-lineage-node" data-kind={node.kind}>
      <header>
        <UsMonoTag tone={nodeTone(node.kind)}>
          {nodeKindLabel(node.kind)}
        </UsMonoTag>
        {node.updatedAt ? (
          <time className="us-data">{node.updatedAt}</time>
        ) : null}
      </header>
      <strong>{entryTitle(workspace, node)}</strong>
      <span>{entrySubtitle(workspace, node)}</span>
    </article>
  );
}

function LineageAnchor({ label }: { readonly label: string }) {
  return (
    <div className="us-lineage-anchor">
      <UsMonoTag active>ANCHOR</UsMonoTag>
      <strong>{label}</strong>
    </div>
  );
}

function localReferenceLineage(
  workspace: WorkspaceState,
  target: SelectionRef,
): Lineage {
  const downstream = workspace.fieldRefs
    .filter(
      (ref) =>
        ref.objectId === target.entityId && ref.fieldCode === target.fieldCode,
    )
    .map((ref) => localRefEntry(workspace, ref));
  return {
    objectId: target.entityId,
    fieldCode: target.fieldCode ?? "",
    upstream: [],
    downstream,
    algorithm: { kind: "stored", ref: "本地引用" },
    partial: false,
    truncated: false,
  };
}

function localRefEntry(workspace: WorkspaceState, ref: FieldRef): LineageEntry {
  const expression = workspace.expressions.find(
    (candidate) => candidate.id === ref.exprId,
  );
  return {
    kind: "recommendation",
    objectId: ref.objectId,
    objectType: "expr",
    fieldCode: ref.fieldCode,
    ref: ref.label,
    source: expression?.name ?? ref.exprId,
    updatedAt: null,
    depth: 1,
  };
}

function groupByDepth(
  entries: readonly LineageEntry[],
): readonly (readonly [number, readonly LineageEntry[]])[] {
  const groups = new Map<number, LineageEntry[]>();
  for (const entry of entries) {
    const depth = Number.isFinite(entry.depth) ? entry.depth : 0;
    groups.set(depth, [...(groups.get(depth) ?? []), entry]);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right);
}

function describeField(
  workspace: WorkspaceState,
  objectId: string,
  fieldCode: FieldCode | undefined,
): string {
  const object = workspace.objects.find(
    (candidate) => candidate.id === objectId,
  );
  const objectLabel = object ? objectName(object) : objectId;
  if (!fieldCode) return objectLabel;
  return `${objectLabel} / ${fieldLabel(workspace, object, fieldCode)}`;
}

function entryTitle(workspace: WorkspaceState, node: LineageEntry): string {
  if (node.objectId) {
    const object = workspace.objects.find(
      (candidate) => candidate.id === node.objectId,
    );
    if (object) return objectName(object);
  }
  return node.source ?? node.ref ?? node.objectType ?? node.kind;
}

function entrySubtitle(workspace: WorkspaceState, node: LineageEntry): string {
  const parts = [
    node.fieldCode
      ? fieldLabel(
          workspace,
          node.objectId
            ? workspace.objects.find((object) => object.id === node.objectId)
            : undefined,
          node.fieldCode,
        )
      : null,
    node.source,
    node.ref,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ") || "无附加说明";
}

function fieldLabel(
  workspace: WorkspaceState,
  object: DataObject | undefined,
  fieldCode: string,
): string {
  const type = workspace.objectTypes.find(
    (candidate) => candidate.code === object?.objectTypeCode,
  );
  return (
    type?.fields.find((field) => field.code === fieldCode)?.name ?? fieldCode
  );
}

function objectName(object: DataObject): string {
  const raw = object.fields.name?.value ?? object.fields.title?.value;
  return typeof raw === "string" && raw.trim() ? raw : object.id;
}

function algorithmLabel(kind: Lineage["algorithm"]["kind"]): string {
  if (kind === "derived") return "DERIVED";
  if (kind === "rule") return "RULE";
  return "STORED";
}

function algorithmTone(
  kind: Lineage["algorithm"]["kind"],
): "primary" | "change" | "danger" | undefined {
  if (kind === "derived") return "primary";
  if (kind === "rule") return "change";
  return undefined;
}

function nodeKindLabel(kind: LineageEntry["kind"]): string {
  if (kind === "derived") return "派生";
  if (kind === "rule") return "规则";
  if (kind === "recommendation") return "引用";
  return "字段";
}

function nodeTone(
  kind: LineageEntry["kind"],
): "primary" | "change" | "danger" | undefined {
  if (kind === "rule") return "change";
  if (kind === "derived") return "primary";
  return undefined;
}
