import { useEffect, useRef, useState, type ReactElement } from "react";

import {
  CommandFailure,
  type CommandClient,
  type ConflictField,
} from "../api/command-client";
import type {
  FieldDefinition,
  ObjectPage,
  ObjectType,
  TreeNodeSummary,
  ViewClient,
  ViewObject,
} from "../api/view-client";
import { ConflictDialog } from "../conflict/conflict-dialog";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import type { SelectionRef } from "../selection/selection-ref";
import { supportsTreeRelation } from "../tree/tree-view";

const MAX_SECTIONS = 200;
const terminalStatuses = new Set([
  "ARCHIVED",
  "DELETED",
  "SOFT_DELETED",
  "soft-deleted",
  "archived",
]);

export interface DocumentField {
  readonly definition: FieldDefinition;
  readonly value: unknown;
}

export interface DocumentSection {
  readonly object: ViewObject;
  readonly depth: number;
  readonly title: string;
  readonly fields: readonly DocumentField[];
  readonly terminal: boolean;
}

export interface DocumentViewProps {
  readonly viewClient: ViewClient;
  readonly commandClient?: CommandClient;
  readonly selection: SelectionCoordinator;
  readonly workspaceId: string;
  readonly rootId: string;
  readonly relationType: string;
  readonly onError?: (title: string) => void;
  readonly onEditField?: () => void;
  /** 归档等结构性变更后回调,供工作台刷新派生/概览条(refreshVersion 联动)。 */
  readonly onArchived?: () => void;
}

export type ArchiveResult =
  | { readonly kind: "archived" }
  | { readonly kind: "error"; readonly message: string };

/**
 * 归档文档节点:走已注册 Archive 命令(AG-301),按对象版本乐观锁。纯函数,便于测试。
 * 不做硬删除(v0.1 边界)。
 */
export async function archiveDocumentObject(
  commandClient: Pick<CommandClient, "archive">,
  workspaceId: string,
  object: ViewObject,
): Promise<ArchiveResult> {
  try {
    await commandClient.archive(
      workspaceId,
      "object",
      object.objectId,
      object.version,
    );
    return { kind: "archived" };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "归档失败",
    };
  }
}

export interface DocumentFieldConflict {
  readonly currentVersion: number;
  readonly fields: readonly ConflictField[];
}

export type DocumentFieldSaveResult =
  | { readonly kind: "saved" }
  | { readonly kind: "conflict"; readonly conflict: DocumentFieldConflict }
  | { readonly kind: "error"; readonly message: string };

export function buildDocumentSections(
  rootId: string,
  edges: readonly TreeNodeSummary[],
  pages: readonly ObjectPage[],
  types: readonly ObjectType[],
): readonly DocumentSection[] {
  const depths = new Map<string, number>([[rootId, 0]]);
  edges.slice(0, MAX_SECTIONS - 1).forEach((edge) => {
    if (!depths.has(edge.targetId)) depths.set(edge.targetId, edge.depth);
  });
  const objects = new Map(
    pages
      .flatMap((page) => page.items)
      .map((object) => [object.objectId, object]),
  );
  const definitions = new Map(types.map((type) => [type.code, type.fields]));
  return [...depths].flatMap(([objectId, depth]) => {
    const object = objects.get(objectId);
    if (!object) return [];
    const fields = (definitions.get(object.objectType) ?? []).map(
      (definition) => ({
        definition,
        value: object.fields[definition.code],
      }),
    );
    return [documentSection(object, depth, fields)];
  });
}

function documentSection(
  object: ViewObject,
  depth: number,
  fields: readonly DocumentField[],
): DocumentSection {
  const preferred = object.fields.name ?? object.fields.title;
  return {
    object,
    depth,
    title:
      preferred === undefined
        ? `${object.objectType} ${object.objectId.slice(0, 8)}`
        : String(preferred),
    fields,
    terminal: terminalStatuses.has(object.status),
  };
}

export function isDocumentSelection(
  selection: SelectionRef | null,
  objectId: string,
  fieldCode?: string,
): boolean {
  if (selection?.entityId !== objectId) return false;
  return fieldCode === undefined
    ? selection.entityType === "object"
    : selection.entityType === "field" && selection.fieldCode === fieldCode;
}

export function selectDocumentField(
  selection: SelectionCoordinator,
  objectId: string,
  fieldCode: string,
): void {
  selection.select({ entityType: "field", entityId: objectId, fieldCode });
}

export function selectDocumentObject(
  selection: SelectionCoordinator,
  objectId: string,
): void {
  selection.select({ entityType: "object", entityId: objectId });
}

export function canEditDocumentField(section: DocumentSection): boolean {
  return !section.terminal;
}

export function canInlineEditDocumentField(
  section: DocumentSection,
  commandClient?: CommandClient,
): boolean {
  return canEditDocumentField(section) && commandClient !== undefined;
}

export function documentEmptyMessage(
  rootId: string,
  relationType: string,
): string {
  if (rootId.trim() === "") return "请选择根对象后查看文档大纲。";
  if (!supportsTreeRelation(relationType)) {
    return "当前关系不支持文档大纲，请切换到 hierarchical 关系。";
  }
  return "暂无可展示的文档节段。";
}

export async function saveDocumentField(
  commandClient: CommandClient,
  workspaceId: string,
  object: ViewObject,
  fieldCode: string,
  value: unknown,
): Promise<DocumentFieldSaveResult> {
  try {
    await commandClient.updateFields(
      workspaceId,
      object.objectId,
      object.version,
      [
        {
          fieldDefCode: fieldCode,
          value,
          expectedFieldVersion: object.version,
        },
      ],
    );
    return { kind: "saved" };
  } catch (error) {
    if (
      error instanceof CommandFailure &&
      error.commandError.code === "KERNEL-409-VERSION-CONFLICT"
    ) {
      return {
        kind: "conflict",
        conflict: {
          currentVersion:
            error.commandError.details?.currentVersion ?? object.version,
          fields: error.commandError.details?.conflictingFields ?? [],
        },
      };
    }
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "保存失败",
    };
  }
}

export function replaceDocumentField(
  sections: readonly DocumentSection[],
  objectId: string,
  fieldCode: string,
  value: unknown,
  version: number,
): readonly DocumentSection[] {
  return sections.map((section) => {
    if (section.object.objectId !== objectId) return section;
    const object = {
      ...section.object,
      version,
      fields: { ...section.object.fields, [fieldCode]: value },
    };
    const fields = section.fields.map((field) =>
      field.definition.code === fieldCode ? { ...field, value } : field,
    );
    return documentSection(object, section.depth, fields);
  });
}

export function DocumentView(props: DocumentViewProps): ReactElement {
  const {
    viewClient,
    commandClient,
    selection,
    workspaceId,
    rootId,
    relationType,
    onError,
    onEditField,
    onArchived,
  } = props;
  const [sections, setSections] = useState<readonly DocumentSection[]>([]);
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const targets = useRef(new Map<string, HTMLElement>());
  const reload = () => setReloadKey((value) => value + 1);

  const updateField = (
    objectId: string,
    fieldCode: string,
    value: unknown,
    version: number,
  ) =>
    setSections((current) =>
      replaceDocumentField(current, objectId, fieldCode, value, version),
    );

  useEffect(() => {
    let active = true;
    void loadSections(viewClient, workspaceId, rootId, relationType)
      .then((loaded) => {
        if (active) setSections(loaded);
      })
      .catch((error: unknown) => {
        if (active)
          onError?.(error instanceof Error ? error.message : "文档加载失败");
      });
    return () => {
      active = false;
    };
  }, [relationType, rootId, viewClient, workspaceId, onError, reloadKey]);

  useEffect(
    () =>
      selection.subscribe((next) => {
        setSelected(next);
        const key = selectionKey(next);
        if (key) targets.current.get(key)?.scrollIntoView({ block: "nearest" });
      }),
    [selection],
  );

  return (
    <section aria-label="文档视图" className="document-view">
      {sections.length === 0 ? (
        <p className="view-empty-state">
          {documentEmptyMessage(rootId, relationType)}
        </p>
      ) : null}
      {sections.map((section) => (
        <DocumentSectionView
          key={section.object.objectId}
          commandClient={commandClient}
          onArchived={() => {
            onArchived?.();
            reload();
          }}
          onEditField={onEditField}
          onError={onError}
          onFieldSaved={updateField}
          section={section}
          selected={selected}
          selection={selection}
          targets={targets.current}
          workspaceId={workspaceId}
        />
      ))}
      {sections.length === MAX_SECTIONS ? (
        <p>仅显示前 {MAX_SECTIONS} 个节段</p>
      ) : null}
    </section>
  );
}

async function loadSections(
  viewClient: ViewClient,
  workspaceId: string,
  rootId: string,
  relationType: string,
): Promise<readonly DocumentSection[]> {
  if (rootId.trim() === "" || !supportsTreeRelation(relationType)) return [];
  const [edges, types] = await Promise.all([
    viewClient.tree(workspaceId, relationType, rootId),
    viewClient.objectTypes(workspaceId),
  ]);
  const pages = await Promise.all(
    types.map((type) =>
      viewClient.objects(workspaceId, type.code, 0, MAX_SECTIONS),
    ),
  );
  return buildDocumentSections(rootId, edges, pages, types);
}

function selectionKey(selection: SelectionRef | null): string | null {
  if (!selection) return null;
  return selection.entityType === "field"
    ? `${selection.entityId}:${selection.fieldCode ?? ""}`
    : selection.entityId;
}

export function ArchiveConfirm(props: {
  readonly title: string;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  return (
    <div
      aria-label="归档确认"
      className="document-archive-confirm"
      role="dialog"
    >
      <p>确认归档「{props.title}」？归档后不可再编辑（不做硬删除）。</p>
      <button disabled={props.busy} onClick={props.onConfirm} type="button">
        {props.busy ? "归档中…" : "确认归档"}
      </button>
      <button disabled={props.busy} onClick={props.onCancel} type="button">
        取消
      </button>
    </div>
  );
}

function DocumentSectionView(props: {
  readonly section: DocumentSection;
  readonly commandClient?: CommandClient;
  readonly selected: SelectionRef | null;
  readonly selection: SelectionCoordinator;
  readonly targets: Map<string, HTMLElement>;
  readonly onEditField?: () => void;
  readonly onError?: (title: string) => void;
  readonly onFieldSaved: (
    objectId: string,
    fieldCode: string,
    value: unknown,
    version: number,
  ) => void;
  readonly onArchived?: () => void;
  readonly workspaceId: string;
}): ReactElement {
  const id = props.section.object.objectId;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const canArchive =
    !props.section.terminal && props.commandClient !== undefined;

  async function archive(): Promise<void> {
    if (!props.commandClient) return;
    setBusy(true);
    const result = await archiveDocumentObject(
      props.commandClient,
      props.workspaceId,
      props.section.object,
    );
    setBusy(false);
    if (result.kind === "archived") {
      setConfirming(false);
      props.onArchived?.();
    } else {
      props.onError?.(result.message);
    }
  }

  return (
    <section
      aria-current={isDocumentSelection(props.selected, id) || undefined}
      className={`document-section ${props.section.terminal ? "document-section-terminal" : ""}`}
      data-object-id={id}
      ref={(element) => register(props.targets, id, element)}
      style={{ marginLeft: `${props.section.depth * 24}px` }}
    >
      <button
        className="document-title"
        onClick={() => selectDocumentObject(props.selection, id)}
        type="button"
      >
        {props.section.title}
      </button>
      {props.section.terminal ? (
        <span className="document-readonly">只读</span>
      ) : null}
      {canArchive ? (
        <button
          className="document-archive"
          onClick={() => setConfirming(true)}
          type="button"
        >
          归档
        </button>
      ) : null}
      {confirming ? (
        <ArchiveConfirm
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void archive()}
          title={props.section.title}
        />
      ) : null}
      {props.section.fields.map((field) => (
        <DocumentFieldView
          commandClient={props.commandClient}
          field={field}
          key={field.definition.code}
          object={props.section.object}
          objectId={id}
          onEditField={props.onEditField}
          onError={props.onError}
          onFieldSaved={props.onFieldSaved}
          selected={props.selected}
          selection={props.selection}
          targets={props.targets}
          terminal={props.section.terminal}
          workspaceId={props.workspaceId}
        />
      ))}
    </section>
  );
}

function DocumentFieldView(props: {
  readonly commandClient?: CommandClient;
  readonly field: DocumentField;
  readonly object: ViewObject;
  readonly objectId: string;
  readonly selected: SelectionRef | null;
  readonly selection: SelectionCoordinator;
  readonly targets: Map<string, HTMLElement>;
  readonly terminal: boolean;
  readonly onEditField?: () => void;
  readonly onError?: (title: string) => void;
  readonly onFieldSaved: (
    objectId: string,
    fieldCode: string,
    value: unknown,
    version: number,
  ) => void;
  readonly workspaceId: string;
}): ReactElement {
  const code = props.field.definition.code;
  const selected = isDocumentSelection(props.selected, props.objectId, code);
  const content = `${props.field.definition.name}: ${String(props.field.value ?? "")}`;
  const [editing, setEditing] = useState(false);
  const [conflict, setConflict] = useState<DocumentFieldConflict | null>(null);
  const editable = !props.terminal && props.commandClient !== undefined;

  async function save(value: unknown, version = props.object.version) {
    if (!props.commandClient) return;
    const result = await saveDocumentField(
      props.commandClient,
      props.workspaceId,
      { ...props.object, version },
      code,
      value,
    );
    if (result.kind === "saved") {
      props.onFieldSaved(props.objectId, code, value, version + 1);
      setEditing(false);
      setConflict(null);
    } else if (result.kind === "conflict") {
      setConflict(result.conflict);
    } else {
      props.onError?.(result.message);
    }
  }
  return (
    <div
      className={
        props.field.definition.dataType === "text"
          ? "document-text"
          : "document-field"
      }
    >
      <span
        aria-current={selected || undefined}
        onClick={() =>
          selectDocumentField(props.selection, props.objectId, code)
        }
        onKeyDown={(event) => {
          if (event.key === "Enter")
            selectDocumentField(props.selection, props.objectId, code);
        }}
        ref={(element) =>
          register(props.targets, `${props.objectId}:${code}`, element)
        }
        role="button"
        tabIndex={0}
      >
        {content}
      </span>
      {editable && editing ? (
        <form
          className="document-field-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save(editorValue(event.currentTarget, props.field.definition));
          }}
        >
          <FieldEditor field={props.field} />
          <button type="submit">保存</button>
          <button onClick={() => setEditing(false)} type="button">
            取消
          </button>
        </form>
      ) : null}
      {editable && !editing ? (
        <button onClick={() => setEditing(true)} type="button">
          编辑 {props.field.definition.name}
        </button>
      ) : null}
      {!editable && !props.terminal && props.onEditField ? (
        <button
          onClick={() => {
            selectDocumentField(props.selection, props.objectId, code);
            props.onEditField?.();
          }}
          type="button"
        >
          在表格中编辑
        </button>
      ) : null}
      {conflict ? (
        <ConflictDialog
          fields={conflict.fields}
          onClose={() => {
            setConflict(null);
            setEditing(false);
          }}
          onConfirm={(choices) => {
            const field = conflict.fields.find(
              (item) => item.fieldDefCode === code,
            );
            if (choices[code] === "mine") {
              void save(
                field?.yourValue ?? props.field.value,
                conflict.currentVersion,
              );
            } else if (field) {
              props.onFieldSaved(
                props.objectId,
                code,
                field.currentValue,
                conflict.currentVersion,
              );
              setConflict(null);
              setEditing(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function FieldEditor({
  field,
}: {
  readonly field: DocumentField;
}): ReactElement {
  const definition = field.definition;
  const value = String(field.value ?? "");
  if (definition.dataType === "text") {
    return (
      <textarea
        aria-label={`编辑 ${definition.name}`}
        defaultValue={value}
        name="value"
      />
    );
  }
  if (definition.dataType === "boolean") {
    return (
      <input
        aria-label={`编辑 ${definition.name}`}
        defaultChecked={field.value === true}
        name="value"
        type="checkbox"
      />
    );
  }
  if (definition.dataType === "enum") {
    return (
      <select
        aria-label={`编辑 ${definition.name}`}
        defaultValue={value}
        name="value"
      >
        {enumValues(definition, value).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      aria-label={`编辑 ${definition.name}`}
      defaultValue={value}
      name="value"
    />
  );
}

function editorValue(form: HTMLFormElement, field: FieldDefinition): unknown {
  const input = form.elements.namedItem("value");
  return field.dataType === "boolean"
    ? input instanceof HTMLInputElement && input.checked
    : input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement ||
        input instanceof HTMLSelectElement
      ? input.value
      : "";
}

function enumValues(
  field: FieldDefinition,
  currentValue: string,
): readonly string[] {
  const values = field.constraints.values ?? field.constraints.options;
  return Array.isArray(values) ? values.map(String) : [currentValue];
}

function register(
  targets: Map<string, HTMLElement>,
  key: string,
  element: HTMLElement | null,
): void {
  if (element) targets.set(key, element);
  else targets.delete(key);
}
