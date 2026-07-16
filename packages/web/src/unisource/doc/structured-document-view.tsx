import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentBodyBlock } from "@m-next/views";

import type { DataFieldPrimitive } from "../model/kernel";
import type { DocModel } from "../model/view-layer";
import { pushToast, UsMonoTag } from "../primitives";
import { sessionStore, type SessionStore } from "../state/session-store";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import {
  useWorkspaceSnapshot,
  workspaceStore,
  type WriteCompletion,
} from "../state/workspace-store";
import {
  buildStructuredDocumentOutline,
  buildStructuredDocumentViewModel,
  documentFieldSelection,
  documentObjectSelection,
  resolveStructuredDocumentActiveOutlineId,
  structuredDocumentOutlineSelection,
  type StructuredDocumentConfig,
  type StructuredDocumentFieldVm,
  type StructuredDocumentOutlineItem,
} from "./structured-document-view-model";
import { StructuredDocumentActionOutlet } from "./structured-document-action-registry";

export function StructuredDocumentView({
  compact,
  config,
  doc,
}: {
  readonly compact: boolean;
  readonly config: StructuredDocumentConfig;
  readonly doc: DocModel;
}) {
  const workspace = useWorkspaceSnapshot();
  const selection = useSelectionSnapshot();
  const vm = useMemo(
    () => buildStructuredDocumentViewModel(workspace, doc, config),
    [config, doc, workspace],
  );
  const outline = useMemo(() => buildStructuredDocumentOutline(vm), [vm]);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const outlineRootObjectId =
    outline.find((item) => item.kind === "root")?.objectId ?? null;
  const activeOutlineRootRef = useRef<string | null>(null);

  useEffect(() => {
    const current = selection.current;
    if (!current) return;
    const id =
      current.entityType === "field"
        ? fieldDomId(current.entityId, current.fieldCode ?? "")
        : current.entityType === "object"
          ? objectDomId(current.entityId)
          : null;
    const element = id ? document.getElementById(id) : null;
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selection]);

  useEffect(() => {
    const rootChanged = activeOutlineRootRef.current !== outlineRootObjectId;
    activeOutlineRootRef.current = outlineRootObjectId;
    setActiveOutlineId((current) =>
      resolveStructuredDocumentActiveOutlineId(
        outline,
        rootChanged ? null : current,
      ),
    );
  }, [outline, outlineRootObjectId]);

  if (vm.state === "dangling" || !vm.root) {
    return <p role="alert">{vm.message ?? "文档引用不可用"}</p>;
  }
  const root = vm.root;
  const saveField = (field: StructuredDocumentFieldVm, rawValue: string) => {
    commitStructuredDocumentFieldEdit({ field, rawValue });
  };
  const saveBody = async (json: string): Promise<void> => {
    await commitStructuredDocumentBodyEdit({ body: vm.body, json });
  };
  const selectOutlineItem = (item: StructuredDocumentOutlineItem) => {
    if (item.state !== "ready") return;
    setActiveOutlineId(item.id);
    const nextSelection = structuredDocumentOutlineSelection(item);
    if (nextSelection) selectionStore.set(nextSelection);
    const targetId = structuredDocumentOutlineTargetId(item);
    if (targetId) {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };
  const statusField = rootField(vm.root, "status");
  const selectObject = (
    object: ReturnType<typeof buildStructuredDocumentViewModel>["root"],
  ) => {
    if (!object) return;
    const item = outline.find(
      (candidate) =>
        candidate.kind !== "section" && candidate.objectId === object.objectId,
    );
    if (item) setActiveOutlineId(item.id);
    selectionStore.set(documentObjectSelection(object));
  };
  return (
    <section
      className="us-doc-layout us-structured-doc__shell"
      data-compact={compact}
    >
      <StructuredDocumentOutline
        items={outline}
        activeId={activeOutlineId}
        onSelect={selectOutlineItem}
      />
      <main className="us-doc-main us-structured-doc__main">
        <header className="us-structured-doc__workspace-head">
          <div className="us-doc-meta">
            <span>{doc.docNo}</span>
            <span>模板:{doc.template}</span>
            <UsMonoTag tone="primary">工作空间数据</UsMonoTag>
          </div>
          {statusField ? (
            <span className="us-structured-doc__status">
              状态：{statusField.valueText}
            </span>
          ) : null}
        </header>
        <article className="us-doc-paper us-structured-doc">
          <p className="us-doc-author">{doc.authorLine}</p>
          {config.bodyFieldCode ? (
            vm.body?.state === "fresh" ? (
              <DocumentBodyBlock
                editable={vm.body.editable}
                onSave={saveBody}
                showToolbar
                value={vm.body.value}
              />
            ) : (
              <section aria-label="正文" className="document-body">
                <span className="document-body-label">正文</span>
                <p role="alert">正文配置不可用，当前字段引用已失效。</p>
              </section>
            )
          ) : null}
          <h1
            className="us-doc-title"
            id={objectDomId(root.objectId)}
            onClick={() => selectObject(root)}
          >
            {root.label}
          </h1>
          <DocumentFieldTable
            fields={root.fields}
            onSave={saveField}
            selection={selection.current}
          />
          {vm.sections.map((section) => (
            <DocumentSection
              key={section.relationTypeCode}
              onSave={saveField}
              onSelectObject={selectObject}
              rootObjectId={root.objectId}
              section={section}
              selection={selection.current}
            />
          ))}
        </article>
      </main>
    </section>
  );
}

export function StructuredDocumentOutline({
  items,
  activeId,
  onSelect,
}: {
  readonly items: readonly StructuredDocumentOutlineItem[];
  readonly activeId: string | null;
  readonly onSelect: (item: StructuredDocumentOutlineItem) => void;
}) {
  return (
    <aside className="us-structured-doc__outline" aria-label="文档大纲">
      <h2>大纲</h2>
      {items.length === 0 ? (
        <p className="us-structured-doc__outline-empty">暂无章节</p>
      ) : (
        <>
          <nav>
            {items.map((item) => (
              <button
                className={`us-structured-doc__outline-item us-structured-doc__outline-item--${item.kind}`}
                data-active={activeId === item.id}
                data-state={item.state}
                disabled={item.state !== "ready"}
                key={item.id}
                onClick={() => onSelect(item)}
                type="button"
              >
                <span>{item.label}</span>
                {item.state === "dangling" || item.state === "missing" ? (
                  <small>{item.message ?? "引用不可用"}</small>
                ) : null}
              </button>
            ))}
          </nav>
          {!items.some((item) => item.kind === "section") ? (
            <p className="us-structured-doc__outline-empty">暂无章节</p>
          ) : null}
        </>
      )}
    </aside>
  );
}

export function structuredDocumentOutlineTargetId(
  item: StructuredDocumentOutlineItem,
): string | null {
  if (item.state !== "ready") return null;
  return item.kind === "section"
    ? sectionDomId(item.relationTypeCode)
    : item.objectId
      ? objectDomId(item.objectId)
      : null;
}

function DocumentSection({
  onSave,
  onSelectObject,
  rootObjectId,
  section,
  selection,
}: {
  readonly onSave: (field: StructuredDocumentFieldVm, rawValue: string) => void;
  readonly onSelectObject: (
    object: ReturnType<typeof buildStructuredDocumentViewModel>["root"],
  ) => void;
  readonly rootObjectId: string;
  readonly section: ReturnType<
    typeof buildStructuredDocumentViewModel
  >["sections"][number];
  readonly selection: ReturnType<typeof useSelectionSnapshot>["current"];
}) {
  return (
    <section
      className="us-doc-tableblock us-structured-doc__section"
      id={sectionDomId(section.relationTypeCode)}
    >
      <header>
        <strong>{section.title}</strong>
      </header>
      <StructuredDocumentActionOutlet
        actionId={section.createAction}
        rootObjectId={rootObjectId}
      />
      {section.state === "missing" ? (
        <p role="alert">{section.message}</p>
      ) : (
        section.rows.map((row) =>
          row.state === "dangling" ? (
            <p key={row.relationId} role="alert">
              {row.message}
            </p>
          ) : (
            <section className="us-structured-doc__row" key={row.relationId}>
              <h3
                id={objectDomId(row.object.objectId)}
                onClick={() => onSelectObject(row.object)}
              >
                {row.object.label}
                <small>{row.object.code}</small>
              </h3>
              <DocumentFieldTable
                fields={row.object.fields}
                onSave={onSave}
                selection={selection}
              />
            </section>
          ),
        )
      )}
    </section>
  );
}

function DocumentFieldTable({
  fields,
  onSave,
  selection,
}: {
  readonly fields: readonly StructuredDocumentFieldVm[];
  readonly onSave: (field: StructuredDocumentFieldVm, rawValue: string) => void;
  readonly selection: ReturnType<typeof useSelectionSnapshot>["current"];
}) {
  return (
    <table className="us-structured-doc__table">
      <tbody>
        {fields.map((field) => (
          <tr key={field.fieldCode}>
            <th>{field.fieldName}</th>
            <td>
              <DocumentFieldValue
                field={field}
                onSave={onSave}
                selected={isSelected(field, selection)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DocumentFieldValue({
  field,
  onSave,
  selected,
}: {
  readonly field: StructuredDocumentFieldVm;
  readonly onSave: (field: StructuredDocumentFieldVm, rawValue: string) => void;
  readonly selected: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(serializeInputValue(field.value));
  const [error, setError] = useState<string | null>(null);
  const select = () => selectionStore.set(documentFieldSelection(field));
  const startEditing = () => {
    select();
    if (!field.editable) return;
    setDraft(serializeInputValue(field.value));
    setError(null);
    setEditing(true);
  };
  const save = () => {
    try {
      onSave(field, draft);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请稍后重试");
    }
  };
  if (field.state === "dangling") {
    return (
      <span id={fieldDomId(field.objectId, field.fieldCode)} role="alert">
        字段引用已失效
      </span>
    );
  }
  if (editing) {
    return (
      <span className="us-structured-doc__editor">
        <StructuredDocumentFieldEditor
          draft={draft}
          field={field}
          onDraftChange={setDraft}
        />
        <button onClick={save} type="button">
          保存
        </button>
        <button onClick={() => setEditing(false)} type="button">
          取消
        </button>
        {error ? <small role="alert">{error}</small> : null}
      </span>
    );
  }
  return (
    <span>
      <button
        className="us-structured-doc__field"
        data-selected={selected}
        data-writable={field.editable}
        id={fieldDomId(field.objectId, field.fieldCode)}
        onClick={select}
        onDoubleClick={startEditing}
        type="button"
      >
        {field.valueText}
      </button>
      {field.editMessage ? (
        <small role="alert">{field.editMessage}</small>
      ) : null}
    </span>
  );
}

export function StructuredDocumentFieldEditor({
  draft,
  field,
  onDraftChange,
}: {
  readonly draft: string;
  readonly field: StructuredDocumentFieldVm;
  readonly onDraftChange: (value: string) => void;
}) {
  const enumOptions = enumOptionsForDocumentField(field);
  if (field.field?.dataType === "enum") {
    return (
      <select
        autoFocus
        onChange={(event) => onDraftChange(event.target.value)}
        value={enumOptions.includes(draft) ? draft : ""}
      >
        {enumOptions.includes(draft) ? null : (
          <option disabled value="">
            当前值不在枚举配置中
          </option>
        )}
        {enumOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      autoFocus
      onChange={(event) => onDraftChange(event.target.value)}
      value={draft}
    />
  );
}

function isSelected(
  field: StructuredDocumentFieldVm,
  selection: ReturnType<typeof useSelectionSnapshot>["current"],
): boolean {
  return (
    selection?.entityType === "field" &&
    selection.entityId === field.objectId &&
    selection.fieldCode === field.fieldCode
  );
}

export type StructuredDocumentCommitResult =
  | {
      readonly kind: "written";
      readonly eventId: string;
      readonly refs: number;
    }
  | { readonly kind: "queued"; readonly changeSetId: string };

export function commitStructuredDocumentFieldEdit(input: {
  readonly field: StructuredDocumentFieldVm;
  readonly rawValue: string;
  readonly session?: Pick<SessionStore, "requestWrite">;
}): StructuredDocumentCommitResult {
  const result = (input.session ?? sessionStore).requestWrite({
    resourceCode: input.field.objectTypeCode,
    objectId: input.field.objectId,
    fieldCode: input.field.fieldCode,
    value: parseStructuredDocumentInputValue(input.rawValue, input.field),
  });
  if (result.queued) {
    pushToast({ title: "已提交审批", desc: "等待管理员确认" });
    return { kind: "queued", changeSetId: result.changeSetId };
  }
  pushToast({ title: `已更新 · ${result.syncedRefs} 处引用已同步` });
  return { kind: "written", eventId: result.eventId, refs: result.syncedRefs };
}

export async function commitStructuredDocumentBodyEdit(input: {
  readonly body: StructuredDocumentFieldVm | null;
  readonly json: string;
  readonly session?: Pick<SessionStore, "requestWrite">;
  readonly waitForLastWrite?: () => Promise<WriteCompletion>;
}): Promise<StructuredDocumentCommitResult> {
  const body = input.body;
  if (!body || body.state === "dangling" || !body.editable) {
    throw new Error("正文不可编辑");
  }
  const result = (input.session ?? sessionStore).requestWrite({
    resourceCode: body.objectTypeCode,
    objectId: body.objectId,
    fieldCode: body.fieldCode,
    value: input.json,
  });
  if (result.queued) {
    pushToast({ title: "正文已提交审批", desc: "等待管理员确认" });
    return { kind: "queued", changeSetId: result.changeSetId };
  }
  const completion = await (
    input.waitForLastWrite ?? (() => workspaceStore.waitForLastWrite())
  )();
  if (completion.state === "failed") {
    pushToast({ title: "正文保存失败", desc: completion.message });
    throw new Error(completion.message);
  }
  pushToast({ title: "正文已保存" });
  return { kind: "written", eventId: result.eventId, refs: result.syncedRefs };
}

export function parseStructuredDocumentInputValue(
  value: string,
  field: StructuredDocumentFieldVm,
): DataFieldPrimitive {
  if (field.editMessage) throw new Error(field.editMessage);
  if (!field.editable) throw new Error("该字段为只读字段");
  if (field.field?.dataType === "enum") {
    const enumValues = enumOptionsForDocumentField(field);
    if (enumValues.length === 0) throw new Error("枚举字段配置不可用");
    if (!enumValues.includes(value)) throw new Error("请选择有效枚举值");
    return value;
  }
  if (value.trim().length === 0) return null;
  if (field.field?.dataType !== "number") return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error("请输入有效数字");
  return numeric;
}

export function enumOptionsForDocumentField(
  field: StructuredDocumentFieldVm,
): readonly string[] {
  return field.field?.dataType === "enum" ? (field.field.enumValues ?? []) : [];
}

function serializeInputValue(value: DataFieldPrimitive): string {
  return value === null ? "" : String(value);
}

function rootField(
  object: ReturnType<typeof buildStructuredDocumentViewModel>["root"],
  fieldCode: string,
): StructuredDocumentFieldVm | null {
  return object?.fields.find((field) => field.fieldCode === fieldCode) ?? null;
}

function fieldDomId(objectId: string, fieldCode: string): string {
  return `document-field-${objectId}-${fieldCode}`;
}

function objectDomId(objectId: string): string {
  return `document-object-${objectId}`;
}

function sectionDomId(relationTypeCode: string): string {
  return `structured-document-section-${relationTypeCode}`;
}
