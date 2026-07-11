import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "./changeset-store";
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

    const result = store.confirmAll("changeset-manual-channel");

    expect(result.ok).toBe(true);
    expect(
      workspace.getObject("sales-offline-dealer")?.fields.month_sales?.value,
    ).toBe(2910);
    expect(workspace.getChangeEvents()).toHaveLength(1);
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

    const result = store.reject("changeset-manual-channel");

    expect(result.ok).toBe(true);
    expect(store.getPending().map((changeSet) => changeSet.id)).not.toContain(
      "changeset-manual-channel",
    );
    expect(
      workspace.getObject("sales-offline-dealer")?.fields.month_sales?.value,
    ).toBe(2850);
    expect(workspace.getChangeEvents()).toHaveLength(0);
  });

  it("rejects with a review record and no data write", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);

    const result = store.rejectChangeSet("changeset-manual-channel", "wangyun");

    expect(result.ok).toBe(true);
    expect(workspace.getReviewRecords()[0]).toMatchObject({
      action: "reject",
      actor: "wangyun",
    });
    expect(workspace.getChangeEvents()).toHaveLength(0);
    expect(
      workspace.getObject("sales-offline-dealer")?.fields.month_sales?.value,
    ).toBe(2850);
  });

  it("skips applied items and resolves after the remaining item is accepted", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);

    const first = store.acceptItems("changeset-ai-quote", ["ai-price"]);
    expect(first.ok).toBe(true);
    expect(first.ok ? first.changeSet.status : null).toBe("pending");
    expect(workspace.getChangeEvents()).toHaveLength(0);

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
});
