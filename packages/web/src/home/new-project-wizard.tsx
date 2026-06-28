import { useEffect, useState, type ReactElement } from "react";

import type {
  CommandClient,
  TemplateCatalogItem,
  ViewClient,
} from "@m-next/views";

export type WizardStep = "name" | "profile" | "config" | "create";

export interface ProjectDraft {
  readonly name: string;
  readonly profile: string;
  readonly workspaceId?: string;
  readonly templateId?: string;
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

export interface NewProjectWizardProps {
  readonly commandClient: CommandClient;
  readonly viewClient: ViewClient;
  readonly onCancel: () => void;
  readonly onCreated: (draft: ProjectDraft) => void;
}

export function NewProjectWizard({
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
      const newWorkspaceId = crypto.randomUUID();
      await commandClient.instantiateWorkspace(
        newWorkspaceId,
        template.templateId,
        templateVersion(template),
        draft.name,
      );
      onCreated({
        ...draft,
        templateId: template.templateId,
        version: templateVersion(template),
        workspaceId: newWorkspaceId,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建项目失败");
    } finally {
      setCreating(false);
    }
  }

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
          <label>
            邀请成员
            <input placeholder="name@example.com" />
          </label>
          <label>
            我的角色
            <select defaultValue="Owner">
              <option>Owner</option>
              <option>Editor</option>
              <option>Viewer</option>
            </select>
          </label>
        </div>
      ) : null}
      {step === "create" ? (
        <div className="wizard-summary">
          <h2>{draft.name}</h2>
          <p>{draft.profile}</p>
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
    profile: "选插件",
    config: "基础配置",
    create: "创建",
  }[step];
}
