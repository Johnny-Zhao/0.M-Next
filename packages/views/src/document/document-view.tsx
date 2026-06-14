import { useEffect, useRef, useState, type ReactElement } from "react";

import type {
  FieldDefinition,
  ObjectPage,
  ObjectType,
  TreeNodeSummary,
  ViewClient,
  ViewObject,
} from "../api/view-client";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import type { SelectionRef } from "../selection/selection-ref";

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
  readonly selection: SelectionCoordinator;
  readonly workspaceId: string;
  readonly rootId: string;
  readonly relationType: string;
  readonly onError?: (title: string) => void;
  readonly onEditField?: () => void;
}

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

export function DocumentView(props: DocumentViewProps): ReactElement {
  const [sections, setSections] = useState<readonly DocumentSection[]>([]);
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  const targets = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let active = true;
    void loadSections(props)
      .then((loaded) => {
        if (active) setSections(loaded);
      })
      .catch((error: unknown) => {
        if (active)
          props.onError?.(
            error instanceof Error ? error.message : "文档加载失败",
          );
      });
    return () => {
      active = false;
    };
  }, [
    props.relationType,
    props.rootId,
    props.viewClient,
    props.workspaceId,
    props.onError,
  ]);

  useEffect(
    () =>
      props.selection.subscribe((next) => {
        setSelected(next);
        const key = selectionKey(next);
        if (key) targets.current.get(key)?.scrollIntoView({ block: "nearest" });
      }),
    [props.selection],
  );

  return (
    <section aria-label="文档视图" className="document-view">
      {sections.map((section) => (
        <DocumentSectionView
          key={section.object.objectId}
          onEditField={props.onEditField}
          section={section}
          selected={selected}
          selection={props.selection}
          targets={targets.current}
        />
      ))}
      {sections.length === MAX_SECTIONS ? (
        <p>仅显示前 {MAX_SECTIONS} 个节段</p>
      ) : null}
    </section>
  );
}

async function loadSections(
  props: DocumentViewProps,
): Promise<readonly DocumentSection[]> {
  const [edges, types] = await Promise.all([
    props.viewClient.tree(props.workspaceId, props.relationType, props.rootId),
    props.viewClient.objectTypes(props.workspaceId),
  ]);
  const pages = await Promise.all(
    types.map((type) =>
      props.viewClient.objects(props.workspaceId, type.code, 0, MAX_SECTIONS),
    ),
  );
  return buildDocumentSections(props.rootId, edges, pages, types);
}

function selectionKey(selection: SelectionRef | null): string | null {
  if (!selection) return null;
  return selection.entityType === "field"
    ? `${selection.entityId}:${selection.fieldCode ?? ""}`
    : selection.entityId;
}

function DocumentSectionView(props: {
  readonly section: DocumentSection;
  readonly selected: SelectionRef | null;
  readonly selection: SelectionCoordinator;
  readonly targets: Map<string, HTMLElement>;
  readonly onEditField?: () => void;
}): ReactElement {
  const id = props.section.object.objectId;
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
      {props.section.fields.map((field) => (
        <DocumentFieldView
          field={field}
          key={field.definition.code}
          objectId={id}
          onEditField={props.onEditField}
          selected={props.selected}
          selection={props.selection}
          targets={props.targets}
          terminal={props.section.terminal}
        />
      ))}
    </section>
  );
}

function DocumentFieldView(props: {
  readonly field: DocumentField;
  readonly objectId: string;
  readonly selected: SelectionRef | null;
  readonly selection: SelectionCoordinator;
  readonly targets: Map<string, HTMLElement>;
  readonly terminal: boolean;
  readonly onEditField?: () => void;
}): ReactElement {
  const code = props.field.definition.code;
  const selected = isDocumentSelection(props.selected, props.objectId, code);
  const content = `${props.field.definition.name}: ${String(props.field.value ?? "")}`;
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
      {!props.terminal && props.onEditField ? (
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
    </div>
  );
}

function register(
  targets: Map<string, HTMLElement>,
  key: string,
  element: HTMLElement | null,
): void {
  if (element) targets.set(key, element);
  else targets.delete(key);
}
