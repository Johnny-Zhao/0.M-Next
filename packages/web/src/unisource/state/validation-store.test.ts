import { describe, expect, it, vi } from "vitest";

import type { MemberId } from "../model/kernel";
import type { RuleOutcome } from "../validation/rules";
import { cloneDemoSeed } from "../seed/demo-seed";
import {
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

    await store.runKernelCheck("lixiao");

    expect(source.actors).toEqual(["lixiao"]);
    expect(source.runCount).toBe(1);
    expect(source.checkedRunIds).toEqual(["kernel-run-1"]);
    expect(store.getSnapshot().results).toBe(localBefore);
    expect(store.getSnapshot().kernelResults.map((r) => r.ruleCode)).toEqual([
      "KERNEL-BLOCK",
    ]);
    expect(store.getSnapshot().kernelRunning).toBe(false);
    expect(store.getSnapshot().kernelRunAt).toContain("T10:32");
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

  it("keeps no-source mode local-only and clears kernel state on reset", async () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace, {
      kernelSource: new FakeKernelValidationSource([
        kernelOutcome("KERNEL-WARN", "warning"),
      ]),
      pushToast: vi.fn(),
    });

    await store.runKernelCheck("wangyun");
    expect(store.getSnapshot().kernelResults).toHaveLength(1);
    store.setKernelSource(null);
    await store.runKernelCheck("wangyun");

    expect(store.getSnapshot().kernelResults).toEqual([]);
    expect(store.getSnapshot().kernelRunAt).toBeNull();
    store.reset();
    expect(store.getSnapshot().kernelResults).toEqual([]);
    store.dispose();
  });

  it("reports kernel validation failures without throwing", async () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const pushToast = vi.fn();
    const source = new FakeKernelValidationSource([]);
    source.failure = new Error("rule service unavailable");
    const store = new ValidationStore(workspace, {
      kernelSource: source,
      pushToast,
    });

    await expect(store.runKernelCheck("wangyun")).resolves.toBeUndefined();

    expect(store.getSnapshot().kernelRunning).toBe(false);
    expect(pushToast).toHaveBeenCalledWith({
      title: "内核校验失败",
      desc: "rule service unavailable",
    });
    store.dispose();
  });
});

class FakeKernelValidationSource implements KernelValidationSource {
  readonly actors: MemberId[] = [];
  readonly checkedRunIds: string[] = [];
  runCount = 0;
  failure: Error | null = null;

  constructor(private readonly results: readonly RuleOutcome[]) {}

  setActor(actorId: MemberId): void {
    this.actors.push(actorId);
  }

  async runRuleCheck(): Promise<string> {
    this.runCount += 1;
    if (this.failure) throw this.failure;
    return `kernel-run-${this.runCount}`;
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
