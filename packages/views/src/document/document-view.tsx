import { useEffect, useRef, useState, type ReactElement } from "react";

import {
  CommandFailure,
  type CommandClient,
  type ConflictField,
} from "../api/command-client";
import { updateSingleField } from "../api/update-single-field";
import {
  isFieldDefinitionReadOnly,
  viewObjectFieldValue,
  type FieldDefinition,
  type ObjectPage,
  type ObjectType,
  type TreeNodeSummary,
  type ViewClient,
  type ViewObject,
} from "../api/view-client";
import { ConflictDialog } from "../conflict/conflict-dialog";
import {
  fieldLabel,
  objectDisplayTitle,
  objectTypeLabel,
} from "../display-labels";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import type { SelectionRef } from "../selection/selection-ref";
import { supportsTreeRelation } from "../tree/tree-view";
import { DocumentBodyBlock } from "./body-editor";

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
  /** 归档 / 加模块等结构性变更后回调,供工作台刷新派生/概览条(refreshVersion 联动)。 */
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

const MODULE_OBJECT_TYPE_CODE = "module";
/** 正文字段码:有专属富文本渲染区,从普通字段列表中隐藏。 */
const BODY_FIELD_CODE = "body";
export const PROPOSAL_OBJECT_TYPE_CODE = "proposal";
export const PROPOSAL_CONTAINS_MODULE_RELATION = "proposal_contains_module";
const RESOLVE_ATTEMPTS = 10;
const RESOLVE_DELAY_MS = 500;
type DocumentHeadingLevel = 1 | 2 | 3 | 4;

export interface DocumentDerivedField {
  readonly code: string;
  readonly label: string;
  readonly value: unknown;
}

export type AddModuleResult =
  | { readonly kind: "added"; readonly moduleId: string }
  | { readonly kind: "pending"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

function realDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 命令失败转可读中文提示;绝不外泄 UUID / 错误码(仅用业务标题或通用兜底文案)。 */
function readableAddModuleError(error: unknown): string {
  if (error instanceof CommandFailure) return error.commandError.title;
  return "添加模块失败,请稍后重试";
}

/**
 * CreateObject 不直接回传新对象 id;沿用仓库既有兜底:创建后按 name 分页查询,取"此前
 * 不存在"的新对象 id。读模型投影有滞后,做有限次重试。
 */
async function resolveNewObjectId(params: {
  readonly viewClient: Pick<ViewClient, "objects">;
  readonly workspaceId: string;
  readonly typeCode: string;
  readonly known: ReadonlySet<string>;
  readonly name: string;
  readonly attempts: number;
  readonly delay: (ms: number) => Promise<void>;
}): Promise<string | null> {
  for (let attempt = 0; attempt < params.attempts; attempt++) {
    const page = await params.viewClient.objects(
      params.workspaceId,
      params.typeCode,
      0,
      MAX_SECTIONS,
    );
    const fresh = page.items.filter((item) => !params.known.has(item.objectId));
    const byName = fresh.find(
      (item) => String(item.fields.name ?? "") === params.name,
    );
    if (byName) return byName.objectId;
    if (fresh.length === 1) return fresh[0]!.objectId;
    if (attempt < params.attempts - 1) await params.delay(RESOLVE_DELAY_MS);
  }
  return null;
}

/**
 * 在方案下新增一个模块:解析 module 类型 → CreateObject(name) → 取回新 id →
 * CreateRelation(proposal_contains_module)。命令只用注册集(AG-301),经命令入口。
 * relationTypeId 由调用方从 relationTypes 缓存解析(proposal_contains_module 的 UUID)。
 */
export async function addModuleToProposal(params: {
  readonly viewClient: Pick<ViewClient, "objectTypes" | "objects">;
  readonly commandClient: Pick<
    CommandClient,
    "createObject" | "createRelation"
  >;
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly name: string;
  readonly relationTypeId: string;
  readonly attempts?: number;
  readonly delay?: (ms: number) => Promise<void>;
}): Promise<AddModuleResult> {
  const name = params.name.trim();
  if (name === "") return { kind: "error", message: "请输入模块名称" };
  try {
    const types = await params.viewClient.objectTypes(params.workspaceId);
    const moduleTypeId = types.find(
      (type) => type.code === MODULE_OBJECT_TYPE_CODE,
    )?.id;
    if (!moduleTypeId) {
      return { kind: "error", message: "当前模板不支持添加模块" };
    }
    const existing = await params.viewClient.objects(
      params.workspaceId,
      MODULE_OBJECT_TYPE_CODE,
      0,
      MAX_SECTIONS,
    );
    const known = new Set(existing.items.map((item) => item.objectId));
    // 预置 power_w=0:读模型只投影"已设"字段,置 0 让属性面板即刻出现「功耗」可填(默认不计入总功耗)。
    await params.commandClient.createObject(params.workspaceId, moduleTypeId, {
      name,
      power_w: 0,
    });
    const moduleId = await resolveNewObjectId({
      viewClient: params.viewClient,
      workspaceId: params.workspaceId,
      typeCode: MODULE_OBJECT_TYPE_CODE,
      known,
      name,
      attempts: params.attempts ?? RESOLVE_ATTEMPTS,
      delay: params.delay ?? realDelay,
    });
    if (!moduleId) {
      // 读模型投影滞后、重试预算耗尽:模块已落库,不作失败处理——软提示 + 触发树刷新,稍后自现。
      return {
        kind: "pending",
        message: "模块已创建，正在同步，稍后会出现在文档树中",
      };
    }
    await params.commandClient.createRelation(
      params.workspaceId,
      params.relationTypeId,
      params.proposalId,
      moduleId,
    );
    return { kind: "added", moduleId };
  } catch (error) {
    return { kind: "error", message: readableAddModuleError(error) };
  }
}

/** 加模块入口状态:relationTypeId 为 null=模板不支持;undefined=加载中。纯函数。 */
export function addModuleEntryState(
  relationTypeId: string | null | undefined,
): {
  readonly disabled: boolean;
  readonly unsupported: boolean;
} {
  return {
    disabled: relationTypeId == null,
    unsupported: relationTypeId === null,
  };
}

/** 新模块落库后:刷新概览条/派生(onRefresh)、重载文档树(reload)、选中新节点。 */
export function handleModuleAdded(
  selection: SelectionCoordinator,
  moduleId: string,
  callbacks: { readonly reload: () => void; readonly onRefresh?: () => void },
): void {
  callbacks.onRefresh?.();
  callbacks.reload();
  selectDocumentObject(selection, moduleId);
}

export interface DocumentFieldConflict {
  readonly currentVersion: number;
  readonly fields: readonly ConflictField[];
}

export type DocumentFieldSaveResult =
  | { readonly kind: "saved"; readonly value: unknown }
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
        value: viewObjectFieldValue(object, definition.code),
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
  return {
    object,
    depth,
    title: objectDisplayTitle(object),
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

export function documentHeadingLevel(depth: number): DocumentHeadingLevel {
  if (depth <= 0) return 1;
  if (depth === 1) return 2;
  if (depth === 2) return 3;
  return 4;
}

export function documentParameterFields(
  fields: readonly DocumentField[],
): readonly DocumentField[] {
  return fields.filter((field) => field.definition.code !== BODY_FIELD_CODE);
}

export function documentDerivedFields(
  object: ViewObject,
): readonly DocumentDerivedField[] {
  return Object.entries(object.derived ?? {}).map(([code, value]) => ({
    code,
    label: fieldLabel(code),
    value,
  }));
}

export function documentFieldDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
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
  raw: string,
  dataType?: string,
): Promise<DocumentFieldSaveResult> {
  try {
    // 经唯一出口 updateSingleField 完成"按字段类型转换 + 提交";非法数字拦截为可读提示。
    // 仅按对象版本乐观锁(object.version 充当 expectedObjectVersion,不传字段版本——前端无 per-field 版本)。
    const result = await updateSingleField(commandClient, {
      workspaceId,
      object,
      fieldCode,
      raw,
      dataType,
    });
    return result.kind === "invalid"
      ? { kind: "error", message: result.message }
      : { kind: "saved", value: result.value };
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

/**
 * 用服务端最新对象整体替换某节段(版本 + 全字段值 + 状态/标题重算),供冲突解决后刷新本地显示,
 * 不留过期版本。字段定义沿用原节段,值取自最新对象。纯函数,便于测试。
 */
export function replaceDocumentObject(
  sections: readonly DocumentSection[],
  objectId: string,
  object: ViewObject,
): readonly DocumentSection[] {
  return sections.map((section) => {
    if (section.object.objectId !== objectId) return section;
    const fields = section.fields.map((field) => ({
      ...field,
      value: object.fields[field.definition.code],
    }));
    return documentSection(object, section.depth, fields);
  });
}

export type DocumentConflictChoice = "mine" | "current";

export type DocumentConflictResolution =
  | { readonly kind: "refreshed"; readonly object: ViewObject }
  | {
      readonly kind: "saved";
      readonly object: ViewObject;
      readonly value: unknown;
    }
  | { readonly kind: "conflict"; readonly conflict: DocumentFieldConflict }
  | { readonly kind: "error"; readonly message: string };

/**
 * 解决文档字段编辑冲突(KERNEL-409)。两个分支都先重新拉取该对象最新 detail——拿到权威版本 +
 * 当前值,不信任 409 details 里可能过期/缺失的 currentVersion(否则本地会留过期版本,下次编辑再撞
 * 409):
 *  - "current"(采用当前值 / 放弃我的草稿):不发任何命令,返回服务端最新对象供本地刷新、关闭对话框;
 *  - "mine"(采用我的值 / 覆盖):用我的草稿值 + 最新对象版本经唯一出口 saveDocumentField 重提。
 * 冲突按对象版本乐观锁(前端无字段级版本,见 updateSingleField 注释)。纯编排,便于测试。
 */
export async function resolveDocumentFieldConflict(params: {
  readonly commandClient: CommandClient;
  readonly viewClient: Pick<ViewClient, "object">;
  readonly workspaceId: string;
  readonly objectId: string;
  readonly fieldCode: string;
  readonly choice: DocumentConflictChoice;
  readonly draft: string;
  readonly dataType?: string;
}): Promise<DocumentConflictResolution> {
  let latest: ViewObject;
  try {
    latest = (
      await params.viewClient.object(params.workspaceId, params.objectId)
    ).object;
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "刷新失败",
    };
  }
  if (params.choice === "current") {
    return { kind: "refreshed", object: latest };
  }
  // 采用我的值:用最新版本重提我的草稿,避免旧版本再撞 409。
  const result = await saveDocumentField(
    params.commandClient,
    params.workspaceId,
    latest,
    params.fieldCode,
    params.draft,
    params.dataType,
  );
  if (result.kind === "saved") {
    return {
      kind: "saved",
      value: result.value,
      object: {
        ...latest,
        version: latest.version + 1,
        fields: { ...latest.fields, [params.fieldCode]: result.value },
      },
    };
  }
  if (result.kind === "conflict") {
    // 极少数:重提又撞版本(投影仍滞后)——回报冲突,由用户再决定。
    return { kind: "conflict", conflict: result.conflict };
  }
  return { kind: "error", message: result.message };
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
  const [moduleRelationTypeId, setModuleRelationTypeId] = useState<
    string | null | undefined
  >(undefined);
  const targets = useRef(new Map<string, HTMLElement>());
  const reload = () => setReloadKey((value) => value + 1);

  // 一次性缓存 proposal_contains_module 的关系类型 UUID(加模块需要它);找不到则禁用入口。
  useEffect(() => {
    let active = true;
    void viewClient
      .relationTypes(workspaceId)
      .then((relations) => {
        if (!active) return;
        const match = relations.find(
          (relation) => relation.code === PROPOSAL_CONTAINS_MODULE_RELATION,
        );
        setModuleRelationTypeId(match?.id ?? null);
      })
      .catch(() => {
        if (active) setModuleRelationTypeId(null);
      });
    return () => {
      active = false;
    };
  }, [viewClient, workspaceId]);

  const updateField = (
    objectId: string,
    fieldCode: string,
    value: unknown,
    version: number,
  ) =>
    setSections((current) =>
      replaceDocumentField(current, objectId, fieldCode, value, version),
    );

  // 冲突解决后:用服务端最新对象整体刷新该节段(版本 + 全字段),不留过期版本。
  const refreshObject = (objectId: string, object: ViewObject) =>
    setSections((current) => replaceDocumentObject(current, objectId, object));

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
      {sections.length > 0 ? (
        <div className="document-paper">
          {sections.map((section) => (
            <DocumentSectionView
              key={section.object.objectId}
              commandClient={commandClient}
              moduleRelationTypeId={moduleRelationTypeId}
              onArchived={() => {
                onArchived?.();
                reload();
              }}
              onEditField={onEditField}
              onError={onError}
              onFieldSaved={updateField}
              onObjectRefreshed={refreshObject}
              onModuleAdded={(moduleId) =>
                handleModuleAdded(selection, moduleId, {
                  reload,
                  onRefresh: onArchived,
                })
              }
              onModulePending={(message) => {
                onError?.(message);
                onArchived?.();
                reload();
              }}
              section={section}
              selected={selected}
              selection={selection}
              targets={targets.current}
              viewClient={viewClient}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      ) : null}
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
      <p>归档「{props.title}」，并解除它与方案的关联？</p>
      <button disabled={props.busy} onClick={props.onConfirm} type="button">
        {props.busy ? "归档中…" : "确认归档"}
      </button>
      <button disabled={props.busy} onClick={props.onCancel} type="button">
        取消
      </button>
    </div>
  );
}

export function AddModuleControl(props: {
  readonly viewClient: Pick<ViewClient, "objectTypes" | "objects">;
  readonly commandClient: Pick<
    CommandClient,
    "createObject" | "createRelation"
  >;
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly relationTypeId: string | null | undefined;
  readonly onAdded: (moduleId: string) => void;
  readonly onPending?: (message: string) => void;
  readonly onError?: (message: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { disabled, unsupported } = addModuleEntryState(props.relationTypeId);

  async function submit(): Promise<void> {
    if (busy || !props.relationTypeId || name.trim() === "") return;
    setBusy(true);
    const result = await addModuleToProposal({
      viewClient: props.viewClient,
      commandClient: props.commandClient,
      workspaceId: props.workspaceId,
      proposalId: props.proposalId,
      name,
      relationTypeId: props.relationTypeId,
    });
    setBusy(false);
    if (result.kind === "added") {
      setName("");
      setOpen(false);
      props.onAdded(result.moduleId);
    } else if (result.kind === "pending") {
      setName("");
      setOpen(false);
      props.onPending?.(result.message);
    } else {
      props.onError?.(result.message);
    }
  }

  if (!open) {
    return (
      <button
        className="document-add-module"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={unsupported ? "当前模板不支持添加模块" : undefined}
        type="button"
      >
        + 添加模块
      </button>
    );
  }
  return (
    <form
      className="document-add-module-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        aria-label="新模块名称"
        autoFocus
        disabled={busy}
        onChange={(event) => setName(event.currentTarget.value)}
        placeholder="模块名称,回车添加"
        value={name}
      />
      <button disabled={busy || name.trim() === ""} type="submit">
        {busy ? "添加中…" : "添加"}
      </button>
      <button
        disabled={busy}
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        type="button"
      >
        取消
      </button>
    </form>
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
  readonly onObjectRefreshed: (objectId: string, object: ViewObject) => void;
  readonly onArchived?: () => void;
  readonly moduleRelationTypeId?: string | null;
  readonly onModuleAdded?: (moduleId: string) => void;
  readonly onModulePending?: (message: string) => void;
  readonly viewClient?: Pick<ViewClient, "objectTypes" | "objects" | "object">;
  readonly workspaceId: string;
}): ReactElement {
  const id = props.section.object.objectId;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bodyConflict, setBodyConflict] =
    useState<DocumentFieldConflict | null>(null);
  const [bodyDraft, setBodyDraft] = useState("");
  const canArchive =
    !props.section.terminal && props.commandClient !== undefined;
  const headingLevel = documentHeadingLevel(props.section.depth);
  const parameterFields = documentParameterFields(props.section.fields);
  const definedCodes = new Set(
    props.section.fields.map((field) => field.definition.code),
  );
  const derivedFields = documentDerivedFields(props.section.object).filter(
    (field) => !definedCodes.has(field.code),
  );

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

  // body 有专属富文本渲染区,从普通字段列表隐藏;保存走 saveDocumentField → updateSingleField(string)。
  const bodyField = props.section.fields.find(
    (item) => item.definition.code === BODY_FIELD_CODE,
  );

  async function saveBody(json: string): Promise<void> {
    if (!props.commandClient) return;
    const result = await saveDocumentField(
      props.commandClient,
      props.workspaceId,
      props.section.object,
      BODY_FIELD_CODE,
      json,
      "string",
    );
    if (result.kind === "saved") {
      props.onFieldSaved(
        id,
        BODY_FIELD_CODE,
        result.value,
        props.section.object.version + 1,
      );
      setBodyConflict(null);
    } else if (result.kind === "conflict") {
      setBodyDraft(json);
      setBodyConflict(result.conflict);
    } else {
      props.onError?.(result.message);
    }
  }

  async function resolveBodyConflict(
    choice: DocumentConflictChoice,
  ): Promise<void> {
    if (!props.commandClient || !props.viewClient) {
      setBodyConflict(null);
      return;
    }
    const resolution = await resolveDocumentFieldConflict({
      commandClient: props.commandClient,
      viewClient: props.viewClient,
      workspaceId: props.workspaceId,
      objectId: id,
      fieldCode: BODY_FIELD_CODE,
      choice,
      draft: bodyDraft,
      dataType: "string",
    });
    if (resolution.kind === "refreshed" || resolution.kind === "saved") {
      props.onObjectRefreshed(id, resolution.object);
      setBodyConflict(null);
    } else if (resolution.kind === "conflict") {
      setBodyConflict(resolution.conflict);
    } else {
      props.onError?.(resolution.message);
      setBodyConflict(null);
    }
  }

  return (
    <section
      aria-current={isDocumentSelection(props.selected, id) || undefined}
      className={`document-section document-section-level-${headingLevel} ${
        props.section.terminal ? "document-section-terminal" : ""
      }`}
      data-object-id={id}
      data-depth={props.section.depth}
      ref={(element) => register(props.targets, id, element)}
    >
      <header className="document-section-header">
        <DocumentHeading
          level={headingLevel}
          onSelect={() => selectDocumentObject(props.selection, id)}
          title={props.section.title}
        />
        <div className="document-section-meta" aria-label="对象元信息">
          <span>{objectTypeLabel(props.section.object.objectType)}</span>
          <span>{props.section.object.status}</span>
          <span>v{props.section.object.version}</span>
          {props.section.terminal ? (
            <span className="document-readonly">只读</span>
          ) : null}
        </div>
        <div className="document-section-actions">
          {canArchive ? (
            <button
              className="document-archive"
              onClick={() => setConfirming(true)}
              type="button"
            >
              归档
            </button>
          ) : null}
        </div>
      </header>
      {confirming ? (
        <ArchiveConfirm
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void archive()}
          title={props.section.title}
        />
      ) : null}
      {props.section.object.objectType === PROPOSAL_OBJECT_TYPE_CODE &&
      !props.section.terminal &&
      props.commandClient &&
      props.viewClient ? (
        <AddModuleControl
          commandClient={props.commandClient}
          onAdded={(moduleId) => props.onModuleAdded?.(moduleId)}
          onError={props.onError}
          onPending={(message) => props.onModulePending?.(message)}
          proposalId={id}
          relationTypeId={props.moduleRelationTypeId}
          viewClient={props.viewClient}
          workspaceId={props.workspaceId}
        />
      ) : null}
      {bodyField ? (
        <DocumentBodyBlock
          editable={
            !props.section.terminal &&
            props.commandClient !== undefined &&
            !isFieldDefinitionReadOnly(bodyField.definition)
          }
          onSave={(json) => saveBody(json)}
          value={bodyField.value}
        />
      ) : null}
      {bodyConflict ? (
        <ConflictDialog
          fields={bodyConflict.fields}
          onClose={() => setBodyConflict(null)}
          onConfirm={(choices) =>
            void resolveBodyConflict(
              choices[BODY_FIELD_CODE] === "mine" ? "mine" : "current",
            )
          }
        />
      ) : null}
      {parameterFields.length > 0 || derivedFields.length > 0 ? (
        <section className="document-parameter-block" aria-label="参数表">
          <div className="document-block-title">
            <strong>参数表</strong>
            <span>模型字段同源</span>
          </div>
          <table className="document-parameter-table">
            <tbody>
              {parameterFields.map((field) => (
                <DocumentFieldView
                  commandClient={props.commandClient}
                  field={field}
                  key={field.definition.code}
                  object={props.section.object}
                  objectId={id}
                  onEditField={props.onEditField}
                  onError={props.onError}
                  onFieldSaved={props.onFieldSaved}
                  onObjectRefreshed={props.onObjectRefreshed}
                  selected={props.selected}
                  selection={props.selection}
                  targets={props.targets}
                  terminal={props.section.terminal}
                  viewClient={props.viewClient}
                  workspaceId={props.workspaceId}
                />
              ))}
              {derivedFields.map((field) => (
                <DocumentDerivedFieldView
                  field={field}
                  key={field.code}
                  objectId={id}
                  selected={props.selected}
                  selection={props.selection}
                  targets={props.targets}
                />
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </section>
  );
}

function DocumentHeading(props: {
  readonly level: DocumentHeadingLevel;
  readonly title: string;
  readonly onSelect: () => void;
}): ReactElement {
  const content = (
    <button className="document-title" onClick={props.onSelect} type="button">
      {props.title}
    </button>
  );
  if (props.level === 1) return <h1>{content}</h1>;
  if (props.level === 2) return <h2>{content}</h2>;
  if (props.level === 3) return <h3>{content}</h3>;
  return <h4>{content}</h4>;
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
  readonly onObjectRefreshed: (objectId: string, object: ViewObject) => void;
  readonly viewClient?: Pick<ViewClient, "object">;
  readonly workspaceId: string;
}): ReactElement {
  const code = props.field.definition.code;
  const selected = isDocumentSelection(props.selected, props.objectId, code);
  const label = fieldLabel(code, props.field.definition.name);
  const [editing, setEditing] = useState(false);
  const [conflict, setConflict] = useState<DocumentFieldConflict | null>(null);
  const [draft, setDraft] = useState("");
  const editable =
    !props.terminal &&
    props.commandClient !== undefined &&
    !isFieldDefinitionReadOnly(props.field.definition);

  async function save(raw: string): Promise<void> {
    if (!props.commandClient) return;
    const result = await saveDocumentField(
      props.commandClient,
      props.workspaceId,
      props.object,
      code,
      raw,
      props.field.definition.dataType,
    );
    if (result.kind === "saved") {
      props.onFieldSaved(
        props.objectId,
        code,
        result.value,
        props.object.version + 1,
      );
      setEditing(false);
      setConflict(null);
    } else if (result.kind === "conflict") {
      setDraft(raw); // 保留我的草稿,供"采用我的值"以最新版本重提
      setConflict(result.conflict);
    } else {
      props.onError?.(result.message);
    }
  }

  // 冲突解决:两分支都先重新拉取最新对象刷新本地,不留过期版本(见 resolveDocumentFieldConflict)。
  async function resolveConflict(
    choice: DocumentConflictChoice,
  ): Promise<void> {
    if (!props.commandClient || !props.viewClient) {
      setConflict(null);
      setEditing(false);
      return;
    }
    const resolution = await resolveDocumentFieldConflict({
      commandClient: props.commandClient,
      viewClient: props.viewClient,
      workspaceId: props.workspaceId,
      objectId: props.objectId,
      fieldCode: code,
      choice,
      draft,
      dataType: props.field.definition.dataType,
    });
    if (resolution.kind === "refreshed" || resolution.kind === "saved") {
      props.onObjectRefreshed(props.objectId, resolution.object);
      setConflict(null);
      setEditing(false);
    } else if (resolution.kind === "conflict") {
      setConflict(resolution.conflict);
    } else {
      props.onError?.(resolution.message);
      setConflict(null);
      setEditing(false);
    }
  }
  return (
    <tr
      className={
        props.field.definition.dataType === "text"
          ? "document-field-row document-field-row-text"
          : "document-field-row"
      }
    >
      <th scope="row">
        <button
          className="document-field-label"
          onClick={() =>
            selectDocumentField(props.selection, props.objectId, code)
          }
          type="button"
        >
          {label}
        </button>
      </th>
      <td>
        <span
          aria-current={selected || undefined}
          className="document-field-value"
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
          {documentFieldDisplayValue(props.field.value)}
        </span>
        {editable && editing ? (
          <form
            className="document-field-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void save(
                editorValue(event.currentTarget, props.field.definition),
              );
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
          <button
            className="document-field-edit"
            onClick={() => setEditing(true)}
            type="button"
          >
            编辑
          </button>
        ) : null}
        {!editable &&
        !props.terminal &&
        props.onEditField &&
        !isFieldDefinitionReadOnly(props.field.definition) ? (
          <button
            className="document-field-edit"
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
            onConfirm={(choices) =>
              void resolveConflict(
                choices[code] === "mine" ? "mine" : "current",
              )
            }
          />
        ) : null}
      </td>
    </tr>
  );
}

function DocumentDerivedFieldView(props: {
  readonly field: DocumentDerivedField;
  readonly objectId: string;
  readonly selected: SelectionRef | null;
  readonly selection: SelectionCoordinator;
  readonly targets: Map<string, HTMLElement>;
}): ReactElement {
  const selected = isDocumentSelection(
    props.selected,
    props.objectId,
    props.field.code,
  );
  return (
    <tr className="document-field-row document-field-row-fx">
      <th scope="row">
        <span className="document-fx-mark">fx</span>
        {props.field.label}
      </th>
      <td>
        <span
          aria-current={selected || undefined}
          className="document-field-value document-field-value-fx"
          onClick={() =>
            selectDocumentField(
              props.selection,
              props.objectId,
              props.field.code,
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter")
              selectDocumentField(
                props.selection,
                props.objectId,
                props.field.code,
              );
          }}
          ref={(element) =>
            register(
              props.targets,
              `${props.objectId}:${props.field.code}`,
              element,
            )
          }
          role="button"
          tabIndex={0}
        >
          {documentFieldDisplayValue(props.field.value)}
        </span>
      </td>
    </tr>
  );
}

function FieldEditor({
  field,
}: {
  readonly field: DocumentField;
}): ReactElement {
  const definition = field.definition;
  const value = String(field.value ?? "");
  const label = fieldLabel(definition.code, definition.name);
  if (definition.dataType === "text") {
    return (
      <textarea
        aria-label={`编辑 ${label}`}
        defaultValue={value}
        name="value"
      />
    );
  }
  if (definition.dataType === "boolean") {
    return (
      <input
        aria-label={`编辑 ${label}`}
        defaultChecked={field.value === true}
        name="value"
        type="checkbox"
      />
    );
  }
  if (definition.dataType === "enum") {
    return (
      <select aria-label={`编辑 ${label}`} defaultValue={value} name="value">
        {enumValues(definition, value).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input aria-label={`编辑 ${label}`} defaultValue={value} name="value" />
  );
}

function editorValue(form: HTMLFormElement, field: FieldDefinition): string {
  const input = form.elements.namedItem("value");
  if (field.dataType === "boolean") {
    return input instanceof HTMLInputElement && input.checked
      ? "true"
      : "false";
  }
  return input instanceof HTMLInputElement ||
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
