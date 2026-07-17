import { describe, expect, it } from "vitest";

import type { ChangeSet } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "../state/changeset-store";
import { WorkspaceStore } from "../state/workspace-store";
import { MockUnisourceGateway, toDemoSeed } from "./mock-gateway";
import type { UnisourceGateway } from "./gateway";

describe("MockUnisourceGateway", () => {
  it("implements the full gateway interface", async () => {
    const gateway = new MockUnisourceGateway() satisfies UnisourceGateway;

    await expect(gateway.loadWorkspace()).resolves.toMatchObject({
      workspace: { id: "ws-unisource-demo" },
    });
  });

  it("persists updateField writes into the next loadWorkspace snapshot", async () => {
    const gateway = new MockUnisourceGateway();

    gateway.setActor("lixiao");
    await gateway.updateField("prod-s3", "price", 1099, {
      actor: "wangyun",
    });
    const snapshot = await gateway.loadWorkspace();
    const product = snapshot.objects.find((object) => object.id === "prod-s3");

    expect(product?.fields.price?.value).toBe(1099);
  });

  it("undoes writes by delegating to the workspace event inverse", async () => {
    const gateway = new MockUnisourceGateway();
    const write = await gateway.updateField("prod-s3", "price", 1099, {
      actor: "wangyun",
    });

    await gateway.undoByEvent(write.event.id);
    const snapshot = await gateway.loadWorkspace();

    expect(
      snapshot.objects.find((object) => object.id === "prod-s3")?.fields.price
        ?.value,
    ).toBe(1199);
  });

  it("confirms only requested AI change items when itemIds are supplied", async () => {
    const gateway = new MockUnisourceGateway();
    const changeSet: ChangeSet = {
      id: "changeset-item-confirm",
      source: "ai",
      status: "pending",
      title: "Item confirm",
      actor: "ai",
      createdAt: "2026-07-10T10:40:00+08:00",
      items: [
        {
          id: "update-name",
          op: "updateField",
          target: {
            entityType: "field",
            entityId: "prod-s3",
            fieldCode: "name",
          },
          oldValue: "Door lock S3",
          nextValue: "Updated S3",
          confirmed: true,
          confidence: 1,
        },
        {
          id: "update-price",
          op: "updateField",
          target: {
            entityType: "field",
            entityId: "prod-s3",
            fieldCode: "price",
          },
          oldValue: 1199,
          nextValue: 999,
          confirmed: true,
          confidence: 1,
        },
      ],
    };

    await gateway.proposeAiChange(changeSet);
    const result = await gateway.confirmAiChange("changeset-item-confirm", [
      "update-name",
    ]);
    const snapshot = await gateway.loadWorkspace();
    const product = snapshot.objects.find((object) => object.id === "prod-s3");
    const storedChangeSet = snapshot.changeSets.find(
      (candidate) => candidate.id === "changeset-item-confirm",
    );

    expect(result.ok).toBe(true);
    expect(product?.fields.name?.value).toBe("Updated S3");
    expect(product?.fields.price?.value).toBe(1199);
    expect(storedChangeSet?.status).toBe("pending");
    expect(
      storedChangeSet?.items.find((item) => item.id === "update-name")?.applied,
    ).toBe(true);
    expect(
      storedChangeSet?.items.find((item) => item.id === "update-price")
        ?.applied,
    ).not.toBe(true);
  });

  it("wraps validation rules behind run ids", async () => {
    const gateway = new MockUnisourceGateway();

    const runId = await gateway.runRuleCheck();
    const results = await gateway.checkResults(runId);

    expect(runId).toBe("mock-rule-run-0001");
    expect(results.map((result) => result.ruleCode)).toContain("XSRC-001");
    await expect(gateway.latestCheckRun()).resolves.toMatchObject({
      runId,
      status: "COMPLETED",
      scopeObjectTypeCode: null,
    });
    await expect(gateway.checkResults("missing")).resolves.toEqual([]);
  });

  it("assembles DemoSeed explicitly from workspace and change-set snapshots", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changeSets = new ChangeSetStore(seed, workspace);

    const assembled = toDemoSeed(
      workspace.getSnapshot(),
      changeSets.getSnapshot(),
    );

    expect(assembled.objects).toBe(workspace.getSnapshot().objects);
    expect(assembled.changeSets).toBe(changeSets.getSnapshot().changeSets);
    expect(assembled.simScenarios).toBe(workspace.getSnapshot().simScenarios);
  });
});
