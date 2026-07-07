import { useEffect, useState, type ReactElement } from "react";

import type {
  CommandClient,
  ObjectType,
  TemplateCatalogItem,
  ViewClient,
} from "@m-next/views";

import { fieldLabel } from "../display-labels";

export type WizardStep = "name" | "profile" | "config" | "create";

/** 技术方案模板 code 与其根对象类型 code(附录A 术语,不得自造同义词)。 */
export const TECHNICAL_PROPOSAL_TEMPLATE_CODE = "technical_proposal";
export const PROPOSAL_OBJECT_TYPE_CODE = "proposal";

export interface ProjectDraft {
  readonly name: string;
  readonly profile: string;
  readonly workspaceId?: string;
  readonly templateId?: string;
  readonly templateCode?: string;
  readonly powerBudget?: string;
  readonly version?: number;
}

export const wizardSteps: readonly WizardStep[] = [
  "name",
  "profile",
  "config",
  "create",
];

export const placeholderProfiles = ["制图工作台基础模板", "系统工程模板"];

export function nextWizardStep(step: WizardStep): WizardStep {
  const index = wizardSteps.indexOf(step);
  return wizardSteps[Math.min(index + 1, wizardSteps.length - 1)] ?? "name";
}

export function previousWizardStep(step: WizardStep): WizardStep {
  const index = wizardSteps.indexOf(step);
  return wizardSteps[Math.max(index - 1, 0)] ?? "name";
}

export function canAdvance(step: WizardStep, draft: ProjectDraft): boolean {
  if (step === "name") return draft.name.trim().length > 0;
  if (step === "profile") return draft.profile.trim().length > 0;
  return true;
}

/** 从模板目录选定版本:优先最新已发布版本,回退到 version。 */
export function templateVersion(template: TemplateCatalogItem): number {
  return template.latestPublishedVersion > 0
    ? template.latestPublishedVersion
    : template.version;
}

/** 是否为技术方案模板——决定是否附带功率预算字段并自动建 proposal 根。 */
export function isTechnicalProposalTemplate(
  template: TemplateCatalogItem | undefined,
): boolean {
  return template?.code === TECHNICAL_PROPOSAL_TEMPLATE_CODE;
}

/** 解析功率预算输入:空串或非法回落 null(字段可空),负数按非法处理。纯函数。 */
export function parsePowerBudget(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** 由对象类型清单按 code 解析 UUID id(CreateObject 需要 objectTypeId 为 UUID)。纯函数。 */
export function findObjectTypeId(
  types: readonly ObjectType[],
  code: string,
): string | null {
  return types.find((type) => type.code === code)?.id ?? null;
}

/** 组装 proposal 根字段:title/version/author 为必填,power_budget_w 可空。纯函数。 */
export function proposalRootFields(
  name: string,
  author: string,
  powerBudgetW: number | null,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    title: name.trim(),
    version: "v1",
    author: author.trim() || "我",
  };
  if (typeof powerBudgetW === "number" && Number.isFinite(powerBudgetW)) {
    fields.power_budget_w = powerBudgetW;
  }
  return fields;
}

export interface CreatedProject {
  readonly workspaceId: string;
  readonly templateId: string;
  readonly templateCode: string;
  readonly version: number;
}

/**
 * 新建项目链路:实例化工作空间 → 若为技术方案模板,解析 proposal 类型并 CreateObject 建根。
 * 命令只用注册集(InstantiateWorkspace/CreateObject),经命令入口(AG-301)。纯编排,便于测试。
 */
export async function instantiateProjectWithTemplate(params: {
  readonly commandClient: Pick<
    CommandClient,
    "instantiateWorkspace" | "createObject"
  >;
  readonly viewClient: Pick<ViewClient, "objectTypes">;
  readonly template: TemplateCatalogItem;
  readonly name: string;
  readonly author: string;
  readonly powerBudgetW: number | null;
  readonly newWorkspaceId: string;
}): Promise<CreatedProject> {
  const version = templateVersion(params.template);
  await params.commandClient.instantiateWorkspace(
    params.newWorkspaceId,
    params.template.templateId,
    version,
    params.name,
  );
  if (isTechnicalProposalTemplate(params.template)) {
    const types = await params.viewClient.objectTypes(params.newWorkspaceId);
    const proposalTypeId = findObjectTypeId(types, PROPOSAL_OBJECT_TYPE_CODE);
    if (!proposalTypeId) {
      throw new Error("模板缺少方案根对象类型,无法创建方案根");
    }
    await params.commandClient.createObject(
      params.newWorkspaceId,
      proposalTypeId,
      proposalRootFields(params.name, params.author, params.powerBudgetW),
    );
  }
  return {
    workspaceId: params.newWorkspaceId,
    templateId: params.template.templateId,
    templateCode: params.template.code,
    version,
  };
}

export interface NewProjectWizardProps {
  readonly actorId: string;
  readonly commandClient: CommandClient;
  readonly viewClient: ViewClient;
  readonly onCancel: () => void;
  readonly onCreated: (draft: ProjectDraft) => void;
}

export function NewProjectWizard({
  actorId,
  commandClient,
  onCancel,
  onCreated,
  viewClient,
}: NewProjectWizardProps): ReactElement {
  const [step, setStep] = useState<WizardStep>("name");
  const [draft, setDraft] = useState<ProjectDraft>({ name: "", profile: "" });
  const [templates, setTemplates] = useState<readonly TemplateCatalogItem[]>(
    [],
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void viewClient
      .templates()
      .then((items) => {
        if (!active) return;
        setTemplates(items);
        setDraft((current) =>
          current.profile || items.length === 0
            ? current
            : { ...current, profile: items[0]?.name ?? "" },
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [viewClient]);

  async function create(): Promise<void> {
    const template =
      templates.find((item) => item.name === draft.profile) ?? templates[0];
    if (!template) {
      setError("暂无可用模板,无法创建项目");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const created = await instantiateProjectWithTemplate({
        commandClient,
        viewClient,
        template,
        name: draft.name,
        author: actorId,
        powerBudgetW: parsePowerBudget(draft.powerBudget ?? ""),
        newWorkspaceId: crypto.randomUUID(),
      });
      onCreated({
        ...draft,
        templateId: created.templateId,
        templateCode: created.templateCode,
        version: created.version,
        workspaceId: created.workspaceId,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建项目失败");
    } finally {
      setCreating(false);
    }
  }

  const selectedTemplate = templates.find(
    (item) => item.name === draft.profile,
  );

  function advance(): void {
    if (!canAdvance(step, draft) || creating) return;
    if (step === "create") void create();
    else setStep(nextWizardStep(step));
  }

  return (
    <section className="home-shell wizard-shell" aria-label="新建项目向导">
      <header className="home-header">
        <div>
          <strong>新建项目</strong>
          <h1>{stepTitle(step)}</h1>
          <p>进项目后能力随用随装。</p>
        </div>
        <button onClick={onCancel} type="button">
          取消
        </button>
      </header>
      <div className="wizard-steps">
        {wizardSteps.map((item) => (
          <span aria-current={item === step ? "step" : undefined} key={item}>
            {stepTitle(item)}
          </span>
        ))}
      </div>
      {step === "name" ? (
        <label className="wizard-field">
          项目名称
          <input
            onChange={(event) =>
              setDraft({ ...draft, name: event.currentTarget.value })
            }
            value={draft.name}
          />
        </label>
      ) : null}
      {step === "profile" ? (
        <fieldset className="profile-options">
          <legend>起步方式 / 模板</legend>
          {templates.length === 0 ? (
            <p>暂无已发布模板;请先在模板库发布,或联系管理员。</p>
          ) : (
            templates.map((template) => (
              <label key={template.templateId}>
                <input
                  checked={draft.profile === template.name}
                  name="profile"
                  onChange={() =>
                    setDraft({ ...draft, profile: template.name })
                  }
                  type="radio"
                />
                {template.name}
                {template.description ? (
                  <small> · {template.description}</small>
                ) : null}
              </label>
            ))
          )}
        </fieldset>
      ) : null}
      {step === "config" ? (
        <div className="wizard-config">
          <label>
            模板
            <input readOnly value={draft.profile} />
          </label>
          {isTechnicalProposalTemplate(selectedTemplate) ? (
            <label>
              {fieldLabel("power_budget_w")}
              <input
                inputMode="numeric"
                min="0"
                onChange={(event) =>
                  setDraft({ ...draft, powerBudget: event.currentTarget.value })
                }
                placeholder="如 500,可留空"
                type="number"
                value={draft.powerBudget ?? ""}
              />
            </label>
          ) : null}
          <label>
            邀请成员
            <input placeholder="name@example.com" />
          </label>
          <label>
            我的角色
            <select defaultValue="负责人">
              <option>负责人</option>
              <option>编辑者</option>
              <option>查看者</option>
            </select>
          </label>
        </div>
      ) : null}
      {step === "create" ? (
        <div className="wizard-summary">
          <h2>{draft.name}</h2>
          <p>{draft.profile}</p>
          {isTechnicalProposalTemplate(selectedTemplate) ? (
            <p>
              {fieldLabel("power_budget_w")}:
              {parsePowerBudget(draft.powerBudget ?? "") === null
                ? "未设置"
                : `${parsePowerBudget(draft.powerBudget ?? "")}W`}
            </p>
          ) : null}
          <p>将以该模板创建并进入新工作空间。</p>
        </div>
      ) : null}
      {error ? (
        <p className="wizard-error" role="alert">
          {error}
        </p>
      ) : null}
      <footer className="wizard-actions">
        <button
          disabled={creating}
          onClick={() => setStep(previousWizardStep(step))}
          type="button"
        >
          上一步
        </button>
        <button
          disabled={!canAdvance(step, draft) || creating}
          onClick={advance}
          type="button"
        >
          {step === "create" ? (creating ? "创建中…" : "创建并进入") : "下一步"}
        </button>
      </footer>
    </section>
  );
}

function stepTitle(step: WizardStep): string {
  return {
    name: "命名",
    profile: "选模板",
    config: "基础配置",
    create: "创建",
  }[step];
}
