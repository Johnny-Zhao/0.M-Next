import { useState, type ReactElement } from "react";

import type { CommandClient, ViewClient } from "@m-next/views";

export type WizardStep = "name" | "profile" | "config" | "create";

export interface ProjectDraft {
  readonly name: string;
  readonly profile: string;
  readonly workspaceId?: string;
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

export interface NewProjectWizardProps {
  readonly commandClient: CommandClient;
  readonly viewClient: ViewClient;
  readonly onCancel: () => void;
  readonly onCreated: (draft: ProjectDraft) => void;
}

export function capabilityTodo(
  commandClient: CommandClient,
  viewClient: ViewClient,
): string {
  return commandClient && viewClient
    ? "TODO(view-API): 模板库与模板实例化命令未提供"
    : "TODO(view-API): client 未就绪";
}

export function NewProjectWizard({
  commandClient,
  onCancel,
  onCreated,
  viewClient,
}: NewProjectWizardProps): ReactElement {
  const [step, setStep] = useState<WizardStep>("name");
  const [draft, setDraft] = useState<ProjectDraft>({
    name: "",
    profile: placeholderProfiles[0] ?? "",
  });
  const todo = capabilityTodo(commandClient, viewClient);

  function advance(): void {
    if (!canAdvance(step, draft)) return;
    if (step === "create") {
      onCreated({
        ...draft,
        workspaceId: "11111111-1111-4111-8111-111111111111",
      });
    } else {
      setStep(nextWizardStep(step));
    }
  }

  return (
    <section className="home-shell wizard-shell" aria-label="新建项目向导">
      <header className="home-header">
        <div>
          <strong>新建项目</strong>
          <h1>{stepTitle(step)}</h1>
          <p>{todo}</p>
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
          <legend>插件 / 模板</legend>
          {placeholderProfiles.map((profile) => (
            <label key={profile}>
              <input
                checked={draft.profile === profile}
                name="profile"
                onChange={() => setDraft({ ...draft, profile })}
                type="radio"
              />
              {profile}
            </label>
          ))}
        </fieldset>
      ) : null}
      {step === "config" ? (
        <div className="wizard-config">
          <label>
            默认对象类型
            <input readOnly value="demo_object" />
          </label>
          <label>
            邀请成员
            <input placeholder="name@example.com" />
          </label>
          <label>
            RBAC 角色
            <select defaultValue="Editor">
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
          <p>TODO(view-API): 创建暂用占位工作空间进入工作台。</p>
        </div>
      ) : null}
      <footer className="wizard-actions">
        <button onClick={() => setStep(previousWizardStep(step))} type="button">
          上一步
        </button>
        <button
          disabled={!canAdvance(step, draft)}
          onClick={advance}
          type="button"
        >
          {step === "create" ? "创建并进入" : "下一步"}
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
