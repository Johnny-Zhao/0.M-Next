import { useSyncExternalStore } from "react";

import type { MemberId } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import {
  deriveShareBlocked,
  runValidationRules,
  type RuleGroup,
  type RuleOutcome,
} from "../validation/rules";
import { workspaceStore, type WorkspaceStore } from "./workspace-store";

export interface ValidationState {
  readonly results: readonly RuleOutcome[];
  readonly runAt: string;
  readonly durationLabel: string;
  readonly ignored: ReadonlySet<string>;
}

export type FixResult =
  | { readonly kind: "fixed"; readonly message: string }
  | {
      readonly kind: "navigate";
      readonly href: string;
      readonly message: string;
    }
  | { readonly kind: "placeholder"; readonly message: string };

type Listener = () => void;

const runClock = "2026-07-10T10:32:00+08:00";

export class ValidationStore {
  private state: ValidationState;
  private readonly listeners = new Set<Listener>();
  private unsubscribeWorkspace: (() => void) | null = null;
  private runSequence = 0;

  constructor(private readonly workspace: WorkspaceStore = workspaceStore) {
    this.state = this.evaluate(new Set(), "0.2s");
    this.unsubscribeWorkspace = this.workspace.subscribe(() => {
      this.runAll("0.1s");
    });
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ValidationState => this.state;

  reset(): void {
    this.state = this.evaluate(new Set(), "0.2s");
    this.emit();
  }

  dispose(): void {
    this.unsubscribeWorkspace?.();
    this.unsubscribeWorkspace = null;
  }

  runAll(durationLabel = "0.2s"): void {
    this.state = this.evaluate(new Set(this.state.ignored), durationLabel);
    this.emit();
  }

  errors(): readonly RuleOutcome[] {
    return this.activeResults().filter((result) => result.level === "error");
  }

  warnings(): readonly RuleOutcome[] {
    return this.activeResults().filter((result) => result.level === "warning");
  }

  passed(): readonly RuleOutcome[] {
    return this.activeResults().filter((result) => result.level === "passed");
  }

  byGroup(group: RuleGroup | "全部规则"): readonly RuleOutcome[] {
    const source =
      group === "全部规则"
        ? this.state.results
        : this.state.results.filter((result) => result.group === group);
    return source;
  }

  shareDisabledReason(): string | null {
    return deriveShareBlocked(this.state.results, this.state.ignored);
  }

  ignore(ruleCode: string, actor: MemberId): void {
    const result = this.state.results.find(
      (candidate) => candidate.ruleCode === ruleCode,
    );
    const ignored = new Set(this.state.ignored);
    ignored.add(ruleCode);
    this.workspace.addReviewRecord({
      target: result?.target ?? { entityType: "object", entityId: ruleCode },
      action: "accept",
      actor,
      note: `忽略校验项 ${ruleCode}`,
    });
    this.state = this.evaluate(ignored, "0.1s");
    this.emit();
  }

  executeFix(ruleCode: string, actor: MemberId): FixResult {
    if (ruleCode === "XSRC-001") {
      const price =
        this.workspace.getObject("prod-s3")?.fields.price?.value ?? null;
      this.workspace.updateField(
        "sales-offline-dealer",
        "cached_price",
        price,
        { actor, summary: "同步渠道售价缓存" },
      );
      return { kind: "fixed", message: "已同步缓存售价" };
    }
    if (ruleCode === "TPL-003") {
      const state = this.workspace.getSnapshot();
      const invalid = state.slotBindings.find((binding) => {
        const object = binding.objectId
          ? this.workspace.getObject(binding.objectId)
          : undefined;
        return (
          binding.slotId.includes("mainboard") &&
          object !== undefined &&
          object?.fields.form_factor?.value !== "ATX"
        );
      });
      const replacement = state.objects.find(
        (object) =>
          object.objectTypeCode === "hardware_products" &&
          object.fields.part_type?.value === "主板" &&
          object.fields.form_factor?.value === "ATX",
      );
      if (invalid && replacement) {
        this.workspace.bindSlot({ bindingId: invalid.id }, replacement.id, {
          actor,
          summary: "换用 ATX 型号",
        });
      }
      return { kind: "fixed", message: "已换用 ATX 型号" };
    }
    if (ruleCode === "REF-002") {
      const ref = this.workspace
        .getSnapshot()
        .fieldRefs.find((candidate) => candidate.state === "dangling");
      return {
        kind: "navigate",
        href: `/expr/exp-spec-doc?form=doc&locate=${ref?.id ?? ""}`,
        message: "正在定位到文档引用",
      };
    }
    return { kind: "placeholder", message: "该动作是后续能力占位" };
  }

  private activeResults(): readonly RuleOutcome[] {
    return this.state.results.filter(
      (result) => !this.state.ignored.has(result.ruleCode),
    );
  }

  private evaluate(
    ignored: ReadonlySet<string>,
    durationLabel: string,
  ): ValidationState {
    this.runSequence += 1;
    return {
      results: runValidationRules(this.workspace.getSnapshot()),
      runAt: runClock.replace(
        ":00+08:00",
        `:${String(this.runSequence).padStart(2, "0")}+08:00`,
      ),
      durationLabel,
      ignored,
    };
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const validationStore = new ValidationStore();

export function resetValidationStore(seed = cloneDemoSeed()): void {
  void seed;
  validationStore.reset();
}

export function useValidationSnapshot(): ValidationState {
  return useSyncExternalStore(
    validationStore.subscribe,
    validationStore.getSnapshot,
    validationStore.getSnapshot,
  );
}
