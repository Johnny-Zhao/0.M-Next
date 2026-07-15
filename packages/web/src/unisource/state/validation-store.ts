import { useSyncExternalStore } from "react";

import type { MemberId } from "../model/kernel";
import { pushToast, type UsToastInput } from "../primitives";
import { cloneDemoSeed } from "../seed/demo-seed";
import {
  deriveShareBlocked,
  runValidationRules,
  type RuleGroup,
  type RuleOutcome,
} from "../validation/rules";
import { workspaceStore, type WorkspaceStore } from "./workspace-store";

export interface ValidationState {
  readonly source: "demo" | "kernel";
  readonly results: readonly RuleOutcome[];
  readonly runAt: string;
  readonly durationLabel: string;
  readonly ignored: ReadonlySet<string>;
  readonly kernelResults: readonly RuleOutcome[];
  readonly kernelRunAt: string | null;
  readonly kernelRunning: boolean;
  readonly kernelStatus: "idle" | "running" | "ready" | "error";
  readonly kernelError: string | null;
  readonly kernelRunId: string | null;
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

export interface KernelValidationSource {
  setActor(actorId: MemberId): void;
  runRuleCheck(objectTypeCode?: string | null): Promise<string>;
  checkResults(runId: string): Promise<readonly RuleOutcome[]>;
}

export class ValidationStore {
  private state: ValidationState;
  private readonly listeners = new Set<Listener>();
  private unsubscribeWorkspace: (() => void) | null = null;
  private runSequence = 0;
  private kernelSource: KernelValidationSource | null = null;
  private readonly showToast: (input: UsToastInput) => number;

  constructor(
    private readonly workspace: WorkspaceStore = workspaceStore,
    options: {
      readonly kernelSource?: KernelValidationSource | null;
      readonly pushToast?: (input: UsToastInput) => number;
    } = {},
  ) {
    this.kernelSource = options.kernelSource ?? null;
    this.showToast = options.pushToast ?? pushToast;
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

  setKernelSource(source: KernelValidationSource | null): void {
    const nextSource = source ? "kernel" : "demo";
    this.kernelSource = source;
    if (this.state.source !== nextSource) {
      this.state = {
        ...this.state,
        source: nextSource,
        kernelResults: [],
        kernelRunAt: null,
        kernelRunning: false,
        kernelStatus: "idle",
        kernelError: null,
        kernelRunId: null,
      };
      this.emit();
    }
  }

  reset(): void {
    this.state = {
      ...this.evaluate(new Set(), "0.2s"),
      kernelResults: [],
      kernelRunAt: null,
      kernelRunning: false,
      kernelStatus: "idle",
      kernelError: null,
      kernelRunId: null,
    };
    this.emit();
  }

  dispose(): void {
    this.unsubscribeWorkspace?.();
    this.unsubscribeWorkspace = null;
  }

  runAll(durationLabel = "0.2s"): void {
    if (this.state.source !== "demo") return;
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
    if (this.state.source === "kernel") {
      return this.state.kernelResults.some((result) => result.level === "error")
        ? "内核校验存在阻断项,修复后可分享"
        : null;
    }
    return (
      deriveShareBlocked(this.state.results, this.state.ignored) ??
      (this.state.kernelResults.some(
        (result) =>
          result.level === "error" && !this.state.ignored.has(result.ruleCode),
      )
        ? "内核校验存在阻断项,修复后可分享"
        : null)
    );
  }

  async runKernelCheck(
    actor: MemberId,
    objectTypeCode?: string | null,
  ): Promise<void> {
    if (
      !this.kernelSource ||
      this.state.source !== "kernel" ||
      this.state.kernelRunning
    )
      return;
    this.kernelSource.setActor(actor);
    this.state = {
      ...this.state,
      kernelRunning: true,
      kernelStatus: "running",
      kernelError: null,
    };
    this.emit();
    try {
      const runId = await this.kernelSource.runRuleCheck(objectTypeCode);
      const results = await this.kernelSource.checkResults(runId);
      this.state = {
        ...this.state,
        kernelResults: results,
        kernelRunAt: this.kernelRunAt(),
        kernelRunning: false,
        kernelStatus: "ready",
        kernelError: null,
        kernelRunId: runId,
      };
      this.emit();
      this.showToast({
        title: `内核校验:${results.length} 命中`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state = {
        ...this.state,
        kernelRunning: false,
        kernelStatus: "error",
        kernelError: message,
      };
      this.emit();
      this.showToast({
        title: "内核校验失败",
        desc: message,
      });
    }
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
    if (this.state.source === "kernel") return this.state.kernelResults;
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
      source: this.kernelSource ? "kernel" : "demo",
      results: runValidationRules(this.workspace.getSnapshot()),
      runAt: runClock.replace(
        ":00+08:00",
        `:${String(this.runSequence).padStart(2, "0")}+08:00`,
      ),
      durationLabel,
      ignored,
      kernelResults: this.state?.kernelResults ?? [],
      kernelRunAt: this.state?.kernelRunAt ?? null,
      kernelRunning: this.state?.kernelRunning ?? false,
      kernelStatus: this.state?.kernelStatus ?? "idle",
      kernelError: this.state?.kernelError ?? null,
      kernelRunId: this.state?.kernelRunId ?? null,
    };
  }

  private kernelRunAt(): string {
    return runClock.replace(
      ":00+08:00",
      `:${String(this.runSequence).padStart(2, "0")}+08:00`,
    );
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
