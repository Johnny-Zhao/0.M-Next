import { useMemo, useState } from "react";

import type { FieldDef } from "../model/kernel";
import type { DocBlockVm, DocRefVm } from "./doc-view-model";
import { RefChip } from "./ref-chip";
import { RefInsertPopover } from "./ref-insert-popover";
import { RebindPopover } from "./rebind-popover";
import { DataPanel } from "./data-panel";
import { UsButton, UsMonoTag, pushToast } from "../primitives";
import { useSessionSnapshot, sessionStore } from "../state/session-store";
import { workspaceStore, useWorkspaceSnapshot } from "../state/workspace-store";
import { buildDocViewModel } from "./doc-view-model";

export function DocView({
  exprId,
  compact = false,
  showDataPanel = true,
}: {
  readonly exprId: string;
  readonly compact?: boolean;
  readonly showDataPanel?: boolean;
}) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const doc = workspace.docModels.find(
    (candidate) => candidate.exprId === exprId,
  );
  const [insertOpen, setInsertOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [insertedRefs, setInsertedRefs] = useState<readonly string[]>([]);
  const [rebindRef, setRebindRef] = useState<DocRefVm | null>(null);
  const vm = useMemo(
    () => (doc ? buildDocViewModel(workspace, doc) : null),
    [doc, workspace],
  );
  const fields = vm?.bindingType?.fields ?? [];
  const canEditView = sessionStore.can(
    session.currentMemberId,
    exprId,
    "editView",
  );

  if (!doc || !vm) return null;

  const locateRef = (refId: string) => {
    const id = `ref-${refId}`;
    const element = document.getElementById(id);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    element?.classList.add("us-doc-flash");
    window.setTimeout(() => element?.classList.remove("us-doc-flash"), 1200);
  };
  const insertField = (field: FieldDef) => {
    const ref = workspaceStore.addFieldRef(
      exprId,
      doc.binding.objectId,
      field.code,
      field.name,
    );
    setInsertedRefs((current) => [...current, ref.id]);
    setInsertOpen(false);
    setQuery("");
    pushToast({ title: "已插入引用" });
  };
  const rebind = (field: FieldDef) => {
    if (!rebindRef) return;
    workspaceStore.rebindFieldRef(rebindRef.refId, field.code);
    setRebindRef(null);
    pushToast({ title: "悬空引用已重绑" });
  };

  return (
    <section className="us-doc-layout" data-compact={compact}>
      <main className="us-doc-main">
        <DocToolbar
          canEditView={canEditView}
          onInsert={() => setInsertOpen(true)}
          onLocateTable={() =>
            document.getElementById("us-doc-table-spec")?.scrollIntoView({
              block: "center",
              behavior: "smooth",
            })
          }
          wordCount={vm.wordCount}
        />
        <article className="us-doc-paper">
          <div className="us-doc-meta">
            <span>{doc.docNo}</span>
            <span>模板:{doc.template}</span>
            <span>
              绑定:{vm.bindingType?.name} ›{" "}
              {vm.bindingObject?.fields.name?.value}
            </span>
          </div>
          <p className="us-doc-author">{doc.authorLine}</p>
          {vm.blocks.map((block, index) => (
            <DocBlock
              block={block}
              key={`${block.kind}-${index}`}
              onActivateDangling={setRebindRef}
            />
          ))}
          {insertOpen ? (
            <div className="us-doc-inserting">
              <RefChip
                insertingQuery={query}
                label="@"
                refVm={{
                  refId: "ghost-inserting",
                  objectId: doc.binding.objectId,
                  fieldCode: "",
                  fieldName: "待插入字段",
                  value: null,
                  valueText: "",
                  state: "inserting",
                  label: "插入引用",
                  chipDomId: "ref-ghost-inserting",
                }}
              />
              <RefInsertPopover
                fields={fields}
                onCancel={() => setInsertOpen(false)}
                onInsert={insertField}
                onQuery={setQuery}
                query={query}
              />
            </div>
          ) : null}
          {insertedRefs.map((refId) => {
            const ref = buildDocViewModel(
              workspaceStore.getSnapshot(),
              doc,
            ).refs.find((candidate) => candidate.refId === refId);
            return ref ? (
              <p className="us-doc-inserted" key={refId}>
                新增引用 <RefChip refVm={ref} />
              </p>
            ) : null;
          })}
          {rebindRef ? (
            <RebindPopover
              fields={fields}
              onCancel={() => setRebindRef(null)}
              onRebind={rebind}
              refVm={rebindRef}
            />
          ) : null}
        </article>
      </main>
      {showDataPanel ? (
        <DataPanel
          onInsert={() => setInsertOpen(true)}
          onLocate={locateRef}
          vm={vm}
        />
      ) : null}
    </section>
  );
}

function DocToolbar({
  canEditView,
  wordCount,
  onInsert,
  onLocateTable,
}: {
  readonly canEditView: boolean;
  readonly wordCount: number;
  readonly onInsert: () => void;
  readonly onLocateTable: () => void;
}) {
  return (
    <div className="us-doc-toolbar">
      <UsButton disabled size="sm" variant="secondary">
        正文 Body ▾
      </UsButton>
      {["B", "I", "U", "S", "•", "1."].map((label) => (
        <button disabled key={label} type="button">
          {label}
        </button>
      ))}
      <UsButton onClick={onLocateTable} size="sm" variant="secondary">
        数据表格
      </UsButton>
      <UsButton
        disabled={!canEditView}
        onClick={onInsert}
        size="sm"
        title={canEditView ? undefined : "只读成员不可编辑表达"}
        variant="primary"
      >
        @引用字段
      </UsButton>
      <span className="us-doc-toolbar__spacer" />
      <UsButton disabled size="sm" variant="ghost">
        评论
      </UsButton>
      <UsButton disabled size="sm" variant="ghost">
        历史
      </UsButton>
      <UsMonoTag>{wordCount} 字</UsMonoTag>
    </div>
  );
}

function DocBlock({
  block,
  onActivateDangling,
}: {
  readonly block: DocBlockVm;
  readonly onActivateDangling: (ref: DocRefVm) => void;
}) {
  if (block.kind === "meta") return null;
  if (block.kind === "h1") {
    return (
      <h1 className="us-doc-title">
        {block.text}
        {block.ref ? <span title={block.ref.fieldName} /> : null}
      </h1>
    );
  }
  if (block.kind === "h2") return <h2>{block.text}</h2>;
  if (block.kind === "paragraph") {
    return (
      <p>
        {block.inlines.map((inline, index) =>
          inline.kind === "text" ? (
            <span key={index}>{inline.text}</span>
          ) : (
            <RefChip
              key={inline.ref.refId}
              onActivateDangling={onActivateDangling}
              refVm={inline.ref}
            />
          ),
        )}
      </p>
    );
  }
  return (
    <section className="us-doc-tableblock" id={`us-doc-${block.id}`}>
      <header>
        <strong>
          {block.title} · 来自 {block.sourceLabel}
        </strong>
        <UsMonoTag tone="primary">✓ 同步</UsMonoTag>
      </header>
      <table>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              <td>
                <RefChip
                  onActivateDangling={onActivateDangling}
                  refVm={row.ref}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
