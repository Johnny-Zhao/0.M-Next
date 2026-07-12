import { describe, expect, it } from "vitest";

import type { ChangeSet, MemberId } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import {
  ChangeSetStore,
  type ChangeSetResult,
  type KernelChangeSetSource,
} from "./changeset-store";
import { WorkspaceStore } from "./workspace-store";

describe("ChangeSetStore", () => {
  it("rejects confirmAll when low-confidence items are not confirmed", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);
    const beforeEvents = workspace.getChangeEvents().length;

    const result = store.confirmAll("changeset-ai-quote");

    expect(result.ok).toBe(false);
    expect(workspace.getChangeEvents()).toHaveLength(beforeEvents);
    expect(workspace.getObject("prod-s3")?.version).toBe(1);
  });

  it("returns ok:false for unknown change set ids", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);

    expect(store.confirmAll("missing")).toEqual({
      ok: false,
      reason: "找不到变更集 missing",
    });
    expect(store.reject("missing").ok).toBe(false);
    expect(store.acceptItems("missing", ["item"]).ok).toBe(false);
  });

  it("confirms a manual change set through the workspace write path", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);
    const beforeEvents = workspace.getChangeEvents().length;

    const result = store.confirmAll("changeset-manual-channel");

    expect(result.ok).toBe(true);
    expect(
      workspace.getObject("sales-offline-dealer")?.fields.month_sales?.value,
    ).toBe(2910);
    expect(workspace.getChangeEvents()).toHaveLength(beforeEvents + 1);
  });

  it("approves with a review record while keeping the write actor", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);

    const result = store.approveChangeSet(
      "changeset-manual-channel",
      "wangyun",
    );

    expect(result.ok).toBe(true);
    expect(workspace.getChangeEvents()[0]?.actor).toBe("chenmo");
    expect(workspace.getReviewRecords()[0]).toMatchObject({
      action: "approve",
      actor: "wangyun",
    });
    expect(workspace.getActivity()[0]?.summary).toContain("批准");
  });

  it("rejects a change set without writing any data", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);
    const beforeEvents = workspace.getChangeEvents().length;

    const result = store.reject("changeset-manual-channel");

    expect(result.ok).toBe(true);
    expect(store.getPending().map((changeSet) => changeSet.id)).not.toContain(
      "changeset-manual-channel",
    );
    expect(
      workspace.getObject("sales-offline-dealer")?.fields.month_sales?.value,
    ).toBe(2850);
    expect(workspace.getChangeEvents()).toHaveLength(beforeEvents);
  });

  it("rejects with a review record and no data write", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);
    const beforeEvents = workspace.getChangeEvents().length;

    const result = store.rejectChangeSet("changeset-manual-channel", "wangyun");

    expect(result.ok).toBe(true);
    expect(workspace.getReviewRecords()[0]).toMatchObject({
      action: "reject",
      actor: "wangyun",
    });
    expect(workspace.getChangeEvents()).toHaveLength(beforeEvents);
    expect(
      workspace.getObject("sales-offline-dealer")?.fields.month_sales?.value,
    ).toBe(2850);
  });

  it("skips applied items and resolves after the remaining item is accepted", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);
    const beforeEvents = workspace.getChangeEvents().length;

    const first = store.acceptItems("changeset-ai-quote", ["ai-price"]);
    expect(first.ok).toBe(true);
    expect(first.ok ? first.changeSet.status : null).toBe("pending");
    expect(workspace.getChangeEvents()).toHaveLength(beforeEvents);

    const final = store.acceptItems("changeset-ai-quote", ["ai-launch"]);
    expect(final.ok).toBe(true);
    expect(final.ok ? final.changeSet.status : null).toBe("resolved");
    expect(workspace.getObject("prod-s3")?.fields.launch_date?.value).toBe(
      "2026-08-18",
    );
  });

  it("applies createObject items through the workspace", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);
    store.submit({
      id: "changeset-create-contract",
      source: "ai",
      status: "pending",
      title: "AI 新增合同",
      actor: "wangyun",
      createdAt: "2026-07-10T10:40:00+08:00",
      items: [
        {
          id: "create-contract",
          op: "createObject",
          target: { entityType: "object", entityId: "contract-new" },
          objectTypeCode: "contracts",
          fields: { name: "新合同", product: "门锁 S3" },
          confirmed: true,
        },
      ],
    });

    const result = store.confirmAll("changeset-create-contract");

    expect(result.ok).toBe(true);
    expect(workspace.getObject("contract-new")?.fields.name?.value).toBe(
      "新合同",
    );
    expect(workspace.getChangeEvents()[0]?.target).toEqual({
      entityType: "object",
      entityId: "contract-new",
    });
  });

  it("refreshes kernel AI change sets without replacing scripted sets", async () => {
    const seed = cloneDemoSeed();
    const source = new FakeKernelChangeSetSource([kernelChangeSet("kernel-1")]);
    const store = new ChangeSetStore(seed, new WorkspaceStore(seed), {
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.refreshKernelAiChanges("lixiao");

    expect(source.actorIds).toEqual(["lixiao"]);
    expect(store.getSnapshot().changeSets).toHaveLength(seed.changeSets.length);
    expect(store.getSnapshot().kernelChangeSets[0]?.id).toBe("kernel-1");
    expect(store.getSnapshot().kernelSyncAt).toBe("2026-07-10T10:32:00+08:00");
    expect(store.getSnapshot().kernelBusy).toBe(false);
  });

  it("confirms selected kernel items and refreshes the overlay", async () => {
    const seed = cloneDemoSeed();
    const source = new FakeKernelChangeSetSource([kernelChangeSet("kernel-1")]);
    const store = new ChangeSetStore(seed, new WorkspaceStore(seed), {
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.confirmKernelItems("kernel-1", ["item-1"], "wangyun");

    expect(source.confirmCalls).toEqual([
      { setId: "kernel-1", itemIds: ["item-1"] },
    ]);
    expect(source.listCalls).toBe(1);
    expect(store.getSnapshot().kernelBusy).toBe(false);
  });

  it("rejects kernel change sets and clears overlay when the source is removed", async () => {
    const seed = cloneDemoSeed();
    const source = new FakeKernelChangeSetSource([kernelChangeSet("kernel-1")]);
    const store = new ChangeSetStore(seed, new WorkspaceStore(seed), {
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.rejectKernel("kernel-1", "wangyun");
    store.setKernelSource(null);

    expect(source.rejectCalls).toEqual(["kernel-1"]);
    expect(store.getSnapshot().kernelChangeSets).toEqual([]);
    expect(store.getSnapshot().kernelSyncAt).toBeNull();
  });
});

class FakeKernelChangeSetSource implements KernelChangeSetSource {
  readonly actorIds: MemberId[] = [];
  readonly confirmCalls: {
    readonly setId: string;
    readonly itemIds: readonly string[] | undefined;
  }[] = [];
  readonly rejectCalls: string[] = [];
  listCalls = 0;

  constructor(private readonly changeSets: readonly ChangeSet[]) {}

  setActor(actorId: MemberId): void {
    this.actorIds.push(actorId);
  }

  async listAiChanges(): Promise<readonly ChangeSet[]> {
    this.listCalls += 1;
    return this.changeSets;
  }

  async confirmAiChange(
    setId: string,
    itemIds?: readonly string[],
  ): Promise<ChangeSetResult> {
    this.confirmCalls.push({ setId, itemIds });
    return { ok: true, changeSet: kernelChangeSet(setId) };
  }

  async rejectAiChange(setId: string): Promise<ChangeSetResult> {
    this.rejectCalls.push(setId);
    return { ok: true, changeSet: kernelChangeSet(setId, "rejected") };
  }
}

function kernelChangeSet(
  id: string,
  status: ChangeSet["status"] = "pending",
): ChangeSet {
  return {
    id,
    source: "ai",
    status,
    title: "内核 AI 建议",
    actor: "ai",
    createdAt: "2026-07-10T10:24:00+08:00",
    items: [
      {
        id: "item-1",
        op: "updateField",
        target: {
          entityType: "field",
          entityId: "prod-s3",
          fieldCode: "price",
        },
        nextValue: 1199,
      },
    ],
  };
}
