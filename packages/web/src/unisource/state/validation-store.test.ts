import { describe, expect, it, vi } from "vitest";

import type { MemberId } from "../model/kernel";
import type { LatestCheckRun } from "../data/gateway";
import type { RuleOutcome } from "../validation/rules";
import { cloneDemoSeed } from "../seed/demo-seed";
import {
  AUTO_KERNEL_CHECK_DEBOUNCE_MS,
  ValidationStore,
  type KernelValidationSource,
} from "./validation-store";
import { WorkspaceStore } from "./workspace-store";

describe("ValidationStore", () => {
  it("runs on construction and reruns after workspace writes", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace);
    const before = store.getSnapshot().runAt;

    expect(store.errors().map((result) => result.ruleCode)).toEqual([
      "XSRC-001",
      "REF-002",
    ]);

    workspace.updateField("sales-offline-dealer", "cached_price", 1199, {
      actor: "wangyun",
    });

    expect(store.getSnapshot().runAt).not.toBe(before);
    expect(store.errors().map((result) => result.ruleCode)).toEqual([
      "REF-002",
    ]);
    store.dispose();
  });

  it("ignores a rule without reviving it on runAll", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace);

    store.ignore("XSRC-001", "wangyun");
    store.runAll();

    expect(store.shareDisabledReason()).toBe("存在校验错误,修复后可分享");
    expect(store.getSnapshot().ignored.has("XSRC-001")).toBe(true);
    expect(workspace.getReviewRecords()[0]?.note).toBe("忽略校验项 XSRC-001");
    store.dispose();
  });

  it("executes scripted fixes through workspace writes", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace);

    expect(store.executeFix("XSRC-001", "wangyun").kind).toBe("fixed");
    expect(
      workspace.getObject("sales-offline-dealer")?.fields.cached_price?.value,
    ).toBe(1199);
    expect(store.executeFix("TPL-003", "wangyun").kind).toBe("fixed");
    const binding = workspace
      .getSlotBindings()
      .find((item) => item.id === "binding-b860-mainboard");
    expect(
      binding?.objectId
        ? workspace.getObject(binding.objectId)?.fields.form_factor?.value
        : null,
    ).toBe("ATX");
    store.dispose();
  });

  it("runs kernel validation sources without replacing local results", async () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const pushToast = vi.fn();
    const source = new FakeKernelValidationSource([
      kernelOutcome("KERNEL-BLOCK", "error"),
    ]);
    const store = new ValidationStore(workspace, {
      kernelSource: source,
      pushToast,
    });
    const localBefore = store.getSnapshot().results;

    await store.runKernelCheck("lixiao", "build_plan");

    expect(source.actors).toEqual(["lixiao"]);
    expect(source.runCount).toBe(1);
    expect(source.checkedRunIds).toEqual(["kernel-run-1"]);
    expect(source.scopes).toEqual(["build_plan"]);
    expect(store.getSnapshot().source).toBe("kernel");
    expect(store.getSnapshot().results).toBe(localBefore);
    expect(store.getSnapshot().kernelResults.map((r) => r.ruleCode)).toEqual([
      "KERNEL-BLOCK",
    ]);
    expect(store.getSnapshot().kernelRunning).toBe(false);
    expect(store.getSnapshot().kernelStatus).toBe("ready");
    expect(store.getSnapshot().kernelRunId).toBe("kernel-run-1");
    expect(store.getSnapshot().kernelRunAt).toBe("2026-07-17T09:30:00Z");
    expect(store.getSnapshot().kernelScope).toBe("build_plan");
    expect(pushToast).toHaveBeenCalledWith({ title: "内核校验:1 命中" });
    store.dispose();
  });

  it("includes kernel BLOCK results in share blocking", async () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace, {
      kernelSource: new FakeKernelValidationSource([
        kernelOutcome("KERNEL-BLOCK", "error"),
      ]),
      pushToast: vi.fn(),
    });

    store.ignore("XSRC-001", "wangyun");
    store.ignore("REF-002", "wangyun");
    expect(store.shareDisabledReason()).toBeNull();

    await store.runKernelCheck("wangyun");

    expect(store.shareDisabledReason()).toBe("内核校验存在阻断项,修复后可分享");
    store.dispose();
  });

  it("clears kernel results on reload and keeps no-source mode local-only", async () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace, {
      kernelSource: new FakeKernelValidationSource([
        kernelOutcome("KERNEL-WARN", "warning"),
      ]),
      pushToast: vi.fn(),
    });

    await store.runKernelCheck("wangyun");
    expect(store.getSnapshot().kernelResults).toHaveLength(1);
    store.reset();
    expect(store.getSnapshot()).toMatchObject({
      source: "kernel",
      kernelResults: [],
      kernelStatus: "idle",
      kernelRunId: null,
    });
    store.setKernelSource(null);
    await store.runKernelCheck("wangyun");

    expect(store.getSnapshot().kernelResults).toEqual([]);
    expect(store.getSnapshot().kernelRunAt).toBeNull();
    expect(store.getSnapshot().source).toBe("demo");
    store.dispose();
  });

  it("marks prior kernel results stale after a workspace write", async () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const source = new FakeKernelValidationSource([
      kernelOutcome("KERNEL-BLOCK", "error"),
    ]);
    const store = new ValidationStore(workspace, {
      kernelSource: source,
      pushToast: vi.fn(),
    });

    await store.runKernelCheck("wangyun", "build_plan");
    workspace.updateField("prod-s3", "price", 1099, { actor: "wangyun" });

    expect(store.getSnapshot()).toMatchObject({
      kernelResults: [kernelOutcome("KERNEL-BLOCK", "error")],
      kernelStatus: "ready",
      kernelRunAt: "2026-07-17T09:30:00Z",
      kernelStale: true,
    });
    expect(source.runCount).toBe(1);
    store.dispose();
  });

  it("reports kernel validation failures without throwing", async () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const pushToast = vi.fn();
    const source = new FakeKernelValidationSource([]);
    const store = new ValidationStore(workspace, {
      kernelSource: source,
      pushToast,
    });
    source.results = [kernelOutcome("PREVIOUS-BLOCK", "error")];
    await store.runKernelCheck("wangyun");
    source.failure = new Error("rule service unavailable");

    await expect(store.runKernelCheck("wangyun")).resolves.toBeUndefined();

    expect(store.getSnapshot().kernelRunning).toBe(false);
    expect(store.getSnapshot().kernelStatus).toBe("error");
    expect(store.getSnapshot().kernelError).toBe("rule service unavailable");
    expect(store.getSnapshot().kernelResults[0]?.ruleCode).toBe(
      "PREVIOUS-BLOCK",
    );
    expect(pushToast).toHaveBeenCalledWith({
      title: "内核校验失败",
      desc: "rule service unavailable",
    });
    store.dispose();
  });

  it("does not treat an idle or empty kernel run as a fabricated pass", async () => {
    const store = new ValidationStore(new WorkspaceStore(cloneDemoSeed()), {
      kernelSource: new FakeKernelValidationSource([]),
      pushToast: vi.fn(),
    });

    expect(store.getSnapshot().kernelStatus).toBe("idle");
    expect(store.passed()).toEqual([]);
    await store.runKernelCheck("wangyun");

    expect(store.getSnapshot().kernelStatus).toBe("ready");
    expect(store.passed()).toEqual([]);
    store.dispose();
  });

  it("hydrates the most recent persisted kernel run without starting another check", async () => {
    const source = new FakeKernelValidationSource([
      kernelOutcome("KERNEL-PERSISTED", "warning"),
    ]);
    source.latestRun = {
      runId: "kernel-run-persisted",
      scopeObjectTypeCode: "build_plan",
      status: "COMPLETED",
      completedAt: "2026-07-17T09:30:00Z",
    };
    const store = new ValidationStore(new WorkspaceStore(cloneDemoSeed()), {
      kernelSource: source,
      pushToast: vi.fn(),
    });

    await store.hydrateKernelCheck();

    expect(source.runCount).toBe(0);
    expect(source.latestReadCount).toBe(1);
    expect(source.checkedRunIds).toEqual(["kernel-run-persisted"]);
    expect(store.getSnapshot()).toMatchObject({
      kernelStatus: "ready",
      kernelRunId: "kernel-run-persisted",
    });
    expect(store.getSnapshot().kernelResults[0]?.ruleCode).toBe(
      "KERNEL-PERSISTED",
    );
    store.dispose();
  });

  it("discards a pending hydration after workspace invalidation", async () => {
    const source = new FakeKernelValidationSource([
      kernelOutcome("KERNEL-PERSISTED", "warning"),
    ]);
    source.latestRun = {
      runId: "kernel-run-persisted",
      scopeObjectTypeCode: null,
      status: "COMPLETED",
      completedAt: "2026-07-17T09:30:00Z",
    };
    let release!: () => void;
    source.latestGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace, {
      kernelSource: source,
      pushToast: vi.fn(),
    });

    const hydration = store.hydrateKernelCheck();
    workspace.updateField("prod-s3", "price", 1099, { actor: "wangyun" });
    release();
    await hydration;

    expect(store.getSnapshot()).toMatchObject({
      kernelResults: [],
      kernelStatus: "idle",
      kernelRunId: null,
      kernelScope: null,
      kernelStale: true,
    });
    store.dispose();
  });

  it("prevents duplicate kernel runs while one is loading", async () => {
    const source = new FakeKernelValidationSource([]);
    let release!: () => void;
    source.runGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = new ValidationStore(new WorkspaceStore(cloneDemoSeed()), {
      kernelSource: source,
      pushToast: vi.fn(),
    });

    const first = store.runKernelCheck("wangyun", "build_plan");
    const duplicate = store.runKernelCheck("wangyun", "build_plan");
    expect(source.runCount).toBe(1);
    release();
    await Promise.all([first, duplicate]);

    expect(source.runCount).toBe(1);
    store.dispose();
  });

  it("debounces consecutive automatic kernel checks", async () => {
    vi.useFakeTimers();
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const source = new FakeKernelValidationSource([]);
    const store = new ValidationStore(workspace, {
      kernelSource: source,
      pushToast: vi.fn(),
    });

    try {
      workspace.updateField("prod-s3", "price", 1099, { actor: "wangyun" });
      store.scheduleAutoKernelCheck("wangyun");
      store.scheduleAutoKernelCheck("wangyun");
      store.scheduleAutoKernelCheck("wangyun");
      await vi.advanceTimersByTimeAsync(AUTO_KERNEL_CHECK_DEBOUNCE_MS);

      expect(source.runCount).toBe(1);
      expect(source.scopes).toEqual([null]);
    } finally {
      store.dispose();
      vi.useRealTimers();
    }
  });

  it("runs one catch-up check when data changes during a kernel run", async () => {
    vi.useFakeTimers();
    const source = new FakeKernelValidationSource([]);
    let release!: () => void;
    source.runGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = new ValidationStore(new WorkspaceStore(cloneDemoSeed()), {
      kernelSource: source,
      pushToast: vi.fn(),
    });

    try {
      const first = store.runKernelCheck("wangyun", null);
      store.scheduleAutoKernelCheck("wangyun");
      await vi.advanceTimersByTimeAsync(AUTO_KERNEL_CHECK_DEBOUNCE_MS);
      expect(source.runCount).toBe(1);

      release();
      await first;
      await vi.runAllTimersAsync();

      expect(source.runCount).toBe(2);
    } finally {
      store.dispose();
      vi.useRealTimers();
    }
  });

  it("clears stale only after a newer automatic run completes", async () => {
    vi.useFakeTimers();
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const source = new FakeKernelValidationSource([
      kernelOutcome("KERNEL-BLOCK", "error"),
    ]);
    const store = new ValidationStore(workspace, {
      kernelSource: source,
      pushToast: vi.fn(),
    });

    try {
      source.completedAt = "2026-07-17T09:30:00Z";
      await store.runKernelCheck("wangyun");
      source.completedAt = "2026-07-17T09:45:00Z";
      workspace.updateField("prod-s3", "price", 1099, { actor: "wangyun" });
      store.scheduleAutoKernelCheck("wangyun");
      expect(store.getSnapshot().kernelStale).toBe(true);

      await vi.advanceTimersByTimeAsync(AUTO_KERNEL_CHECK_DEBOUNCE_MS);

      expect(store.getSnapshot()).toMatchObject({
        kernelStale: false,
        kernelRunAt: "2026-07-17T09:45:00Z",
      });
    } finally {
      store.dispose();
      vi.useRealTimers();
    }
  });

  it("keeps stale results after automatic failure until a manual retry succeeds", async () => {
    vi.useFakeTimers();
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const source = new FakeKernelValidationSource([
      kernelOutcome("KERNEL-BLOCK", "error"),
    ]);
    const store = new ValidationStore(workspace, {
      kernelSource: source,
      pushToast: vi.fn(),
    });

    try {
      await store.runKernelCheck("wangyun");
      source.failure = new Error("rule service unavailable");
      workspace.updateField("prod-s3", "price", 1099, { actor: "wangyun" });
      store.scheduleAutoKernelCheck("wangyun");
      await vi.advanceTimersByTimeAsync(AUTO_KERNEL_CHECK_DEBOUNCE_MS);

      expect(store.getSnapshot()).toMatchObject({
        kernelStatus: "error",
        kernelStale: true,
      });

      source.failure = null;
      await store.runKernelCheck("wangyun", null);
      expect(store.getSnapshot().kernelStale).toBe(false);
    } finally {
      store.dispose();
      vi.useRealTimers();
    }
  });

  it("does not schedule kernel checks in demo mode", async () => {
    vi.useFakeTimers();
    const store = new ValidationStore(new WorkspaceStore(cloneDemoSeed()));

    try {
      store.scheduleAutoKernelCheck("wangyun");
      await vi.runAllTimersAsync();
      expect(store.getSnapshot().source).toBe("demo");
      expect(store.getSnapshot().kernelStale).toBe(false);
    } finally {
      store.dispose();
      vi.useRealTimers();
    }
  });
});

class FakeKernelValidationSource implements KernelValidationSource {
  readonly actors: MemberId[] = [];
  readonly checkedRunIds: string[] = [];
  readonly scopes: (string | null | undefined)[] = [];
  runCount = 0;
  latestRun: LatestCheckRun = {
    runId: null,
    scopeObjectTypeCode: null,
    status: null,
    completedAt: null,
  };
  latestReadCount = 0;
  failure: Error | null = null;
  completedAt = "2026-07-17T09:30:00Z";
  runGate: Promise<void> | null = null;
  latestGate: Promise<void> | null = null;

  constructor(public results: readonly RuleOutcome[]) {}

  setActor(actorId: MemberId): void {
    this.actors.push(actorId);
  }

  async runRuleCheck(objectTypeCode?: string | null): Promise<string> {
    this.runCount += 1;
    this.scopes.push(objectTypeCode);
    await this.runGate;
    if (this.failure) throw this.failure;
    const runId = `kernel-run-${this.runCount}`;
    this.latestRun = {
      runId,
      scopeObjectTypeCode: objectTypeCode ?? null,
      status: "COMPLETED",
      completedAt: this.completedAt,
    };
    return runId;
  }

  async latestCheckRun(): Promise<LatestCheckRun> {
    this.latestReadCount += 1;
    await this.latestGate;
    if (this.failure) throw this.failure;
    return this.latestRun;
  }

  async checkResults(runId: string): Promise<readonly RuleOutcome[]> {
    this.checkedRunIds.push(runId);
    return this.results;
  }
}

function kernelOutcome(
  ruleCode: string,
  level: RuleOutcome["level"],
): RuleOutcome {
  return {
    ruleCode,
    group: "字段约束",
    level,
    title: ruleCode,
    detail: `${ruleCode} detail`,
    target: { entityType: "object", entityId: `target-${ruleCode}` },
    impact: [],
    fixes: [],
  };
}
