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

  it("accepts items partially and resolves after the remaining items are accepted", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const store = new ChangeSetStore(seed, workspace);

    const first = store.acceptItems("changeset-ai-quote", ["ai-price"]);
    expect(first.ok).toBe(true);
    expect(first.ok ? first.changeSet.status : null).toBe("pending");
    expect(workspace.getChangeEvents()).toHaveLength(1);
    expect(workspace.getActivity()[0]?.summary).toContain("供应商报价邮件解析");

    const final = store.acceptItems("changeset-ai-quote", [
      "ai-battery",
      "ai-launch",
    ]);
    expect(final.ok).toBe(true);
    expect(final.ok ? final.changeSet.status : null).toBe("resolved");
    expect(workspace.getObject("prod-s3")?.fields.launch_date?.value).toBe(
      "2026-08-18",
    );
  });
});
