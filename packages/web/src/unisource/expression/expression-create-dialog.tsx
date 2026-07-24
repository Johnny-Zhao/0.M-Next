import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useKernelRuntimeState } from "../data/boot-mode";
import type { GatewayCapabilities, UnisourceGateway } from "../data/gateway";
import { UsButton, UsInput, UsModal, UsSelect, pushToast } from "../primitives";
import { usPaths } from "../routes-paths";
import {
  type WorkspaceState,
  useWorkspaceSnapshot,
} from "../state/workspace-store";
import {
  closeExpressionCreateDialog,
  useExpressionCreateDialogState,
} from "./expression-create-dialog-store";
import {
  expressionFormOptions,
  expressionRelationOptions,
  initialExpressionDraft,
  prepareExpressionConfig,
  relationKey,
  type ExpressionCreateResult,
  type ExpressionDraft,
} from "./expression-create-model";

export type ExpressionCreateSubmission =
  | ExpressionCreateResult
  | { readonly state: "unavailable" | "failed"; readonly message: string };

export async function commitExpressionCreation(options: {
  readonly capabilities: GatewayCapabilities;
  readonly draft: ExpressionDraft;
  readonly workspace: WorkspaceState;
  readonly gateway: Pick<UnisourceGateway, "createExpressionConfig"> | null;
  readonly navigate: (path: string) => void;
}): Promise<ExpressionCreateSubmission> {
  const capability = options.capabilities.expressionPersistence;
  if (capability.mode === "unavailable") {
    return {
      state: "unavailable",
      message: capability.reason ?? "表达保存能力尚未接入",
    };
  }
  const prepared = prepareExpressionConfig(options.workspace, options.draft);
  if (prepared.state === "invalid") return prepared;
  if (!options.gateway) {
    return {
      state: "unavailable",
      message: "表达保存服务尚未准备好，请稍后重试。",
    };
  }
  try {
    const result = await options.gateway.createExpressionConfig(prepared.input);
    options.navigate(usPaths.expr(result.expression.id, result.view.kind));
    return { state: "created", ...result };
  } catch (error) {
    return {
      state: "failed",
      message:
        error instanceof Error ? error.message : "表达保存失败，请重试。",
    };
  }
}

export function ExpressionCreateDialog() {
  const dialog = useExpressionCreateDialogState();
  const workspace = useWorkspaceSnapshot();
  const runtime = useKernelRuntimeState();
  const navigate = useNavigate();
  const objectTypes = workspace.objectTypes;
  const [draft, setDraft] = useState(() =>
    initialExpressionDraft({ objectTypes }),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const rootType = objectTypes.find(
    (type) => type.code === draft.rootObjectTypeCode,
  );
  const relationOptions = useMemo(
    () =>
      expressionRelationOptions(
        workspace.relationTypes,
        draft.rootObjectTypeCode,
      ),
    [draft.rootObjectTypeCode, workspace.relationTypes],
  );
  const formOptions = expressionFormOptions(workspace, draft);
  const persistence = runtime.gatewayCapabilities.expressionPersistence;

  useEffect(() => {
    if (!dialog.open) return;
    setDraft(initialExpressionDraft({ objectTypes }));
    setMessage(null);
    setSubmitting(false);
    submittingRef.current = false;
  }, [dialog.open, dialog.revision, objectTypes]);

  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setMessage(null);
    const result = await commitExpressionCreation({
      capabilities: runtime.gatewayCapabilities,
      draft,
      workspace,
      gateway: runtime.expressionGateway,
      navigate,
    });
    if (result.state !== "created") {
      setMessage(result.message);
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    pushToast({
      title: "表达已创建",
      desc: `首个形式：${result.view.kind.toUpperCase()}`,
    });
    closeExpressionCreateDialog();
  };

  const close = () => {
    if (!submittingRef.current) closeExpressionCreateDialog();
  };

  return (
    <UsModal
      footer={
        <>
          <UsButton disabled={submitting} onClick={close} variant="ghost">
            取消
          </UsButton>
          <UsButton
            disabled={persistence.mode === "unavailable" || submitting}
            onClick={() => void submit()}
            variant="primary"
          >
            {submitting ? "正在创建…" : "创建表达"}
          </UsButton>
        </>
      }
      onClose={close}
      open={dialog.open}
      title="新建表达"
    >
      <div className="us-expression-create">
        {persistence.mode === "unavailable" ? (
          <p className="us-expression-create__notice" role="status">
            {persistence.reason ?? "表达保存能力尚未接入"}
            。当前模式不会修改工作空间。
          </p>
        ) : null}
        <section className="us-expression-create__section">
          <h3>基本信息</h3>
          <label className="us-create-record-form__field">
            <span>表达名称 *</span>
            <UsInput
              aria-label="表达名称"
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              value={draft.name}
            />
          </label>
          <label className="us-create-record-form__field">
            <span>用途说明</span>
            <UsInput
              aria-label="用途说明"
              onChange={(event) =>
                setDraft({ ...draft, purpose: event.target.value })
              }
              value={draft.purpose}
            />
          </label>
          <label className="us-create-record-form__field">
            <span>当前工作空间</span>
            <UsInput
              aria-label="当前工作空间"
              disabled
              value={workspace.workspace.name}
            />
          </label>
        </section>
        <section className="us-expression-create__section">
          <h3>数据范围</h3>
          <label className="us-create-record-form__field">
            <span>根对象类型 *</span>
            <UsSelect
              aria-label="根对象类型"
              onChange={(event) =>
                setDraftForRoot(setDraft, workspace, draft, event.target.value)
              }
              value={draft.rootObjectTypeCode}
            >
              <option value="">请选择对象类型</option>
              {workspace.objectTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.name} · {type.code}
                </option>
              ))}
            </UsSelect>
          </label>
          <fieldset className="us-expression-create__choices">
            <legend>字段</legend>
            {rootType?.fields.map((field) => (
              <label key={field.code}>
                <input
                  checked={draft.fieldCodes.includes(field.code)}
                  onChange={() => setDraft(toggleDraftField(draft, field.code))}
                  type="checkbox"
                />
                <span>
                  {field.name} · {field.code}
                </span>
              </label>
            ))}
            {rootType?.fields.length ? null : (
              <span>当前对象类型没有可用字段。</span>
            )}
          </fieldset>
          <fieldset className="us-expression-create__choices">
            <legend>关系（类型 · 方向）</legend>
            {relationOptions.map((option) => (
              <label key={option.key}>
                <input
                  checked={draft.relations.some(
                    (item) => relationKey(item) === option.key,
                  )}
                  onChange={() => setDraft(toggleDraftRelation(draft, option))}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
            {relationOptions.length ? null : (
              <span>当前根对象类型没有可选关系。</span>
            )}
          </fieldset>
        </section>
        <section className="us-expression-create__section">
          <h3>首个描述形式</h3>
          <label className="us-create-record-form__field">
            <span>形式 *</span>
            <UsSelect
              aria-label="首个描述形式"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  viewKind: event.target.value as ExpressionDraft["viewKind"],
                })
              }
              value={draft.viewKind}
            >
              {formOptions.map((option) => (
                <option
                  disabled={!option.enabled}
                  key={option.kind}
                  value={option.kind}
                >
                  {option.label}
                  {option.enabled ? "" : "（不可用）"}
                </option>
              ))}
            </UsSelect>
          </label>
          <ul className="us-expression-create__capabilities">
            {formOptions.map((option) => (
              <li data-enabled={option.enabled} key={option.kind}>
                <strong>{option.kind.toUpperCase()}</strong>
                <span>{option.enabled ? "可创建" : option.reason}</span>
              </li>
            ))}
          </ul>
          {draft.viewKind === "grid" ? (
            <GridSortFields
              draft={draft}
              rootType={rootType}
              setDraft={setDraft}
            />
          ) : null}
        </section>
        {message ? (
          <p className="us-create-record-form__message" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </UsModal>
  );
}

function GridSortFields({
  draft,
  rootType,
  setDraft,
}: {
  readonly draft: ExpressionDraft;
  readonly rootType: WorkspaceState["objectTypes"][number] | undefined;
  readonly setDraft: (draft: ExpressionDraft) => void;
}) {
  const selectedFields =
    rootType?.fields.filter((field) => draft.fieldCodes.includes(field.code)) ??
    [];
  return (
    <div className="us-expression-create__sort">
      <label className="us-create-record-form__field">
        <span>默认排序字段</span>
        <UsSelect
          aria-label="默认排序字段"
          onChange={(event) =>
            setDraft({ ...draft, sortFieldCode: event.target.value })
          }
          value={draft.sortFieldCode}
        >
          {selectedFields.map((field) => (
            <option key={field.code} value={field.code}>
              {field.name}
            </option>
          ))}
        </UsSelect>
      </label>
      <label className="us-create-record-form__field">
        <span>排序方向</span>
        <UsSelect
          aria-label="排序方向"
          onChange={(event) =>
            setDraft({
              ...draft,
              sortDirection: event.target
                .value as ExpressionDraft["sortDirection"],
            })
          }
          value={draft.sortDirection}
        >
          <option value="asc">升序</option>
          <option value="desc">降序</option>
        </UsSelect>
      </label>
    </div>
  );
}

function setDraftForRoot(
  setDraft: (draft: ExpressionDraft) => void,
  workspace: Pick<WorkspaceState, "objectTypes">,
  current: ExpressionDraft,
  rootObjectTypeCode: string,
): void {
  const root = workspace.objectTypes.find(
    (type) => type.code === rootObjectTypeCode,
  );
  const fieldCodes = root?.fields.slice(0, 3).map((field) => field.code) ?? [];
  setDraft({
    ...current,
    rootObjectTypeCode,
    fieldCodes,
    relations: [],
    sortFieldCode: fieldCodes[0] ?? "",
  });
}

function toggleDraftField(
  draft: ExpressionDraft,
  fieldCode: string,
): ExpressionDraft {
  const fieldCodes = draft.fieldCodes.includes(fieldCode)
    ? draft.fieldCodes.filter((code) => code !== fieldCode)
    : [...draft.fieldCodes, fieldCode];
  return {
    ...draft,
    fieldCodes,
    sortFieldCode: fieldCodes.includes(draft.sortFieldCode)
      ? draft.sortFieldCode
      : (fieldCodes[0] ?? ""),
  };
}

function toggleDraftRelation(
  draft: ExpressionDraft,
  relation: ExpressionDraft["relations"][number],
): ExpressionDraft {
  const selected = draft.relations.some(
    (item) => relationKey(item) === relationKey(relation),
  );
  return {
    ...draft,
    relations: selected
      ? draft.relations.filter(
          (item) => relationKey(item) !== relationKey(relation),
        )
      : [...draft.relations, relation],
  };
}
