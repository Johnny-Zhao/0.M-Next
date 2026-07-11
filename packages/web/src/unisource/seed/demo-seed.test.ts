import { describe, expect, it } from "vitest";

import { demoSeed } from "./demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { runValidationRules } from "../validation/rules";

describe("demoSeed", () => {
  it("keeps the scripted S3 authority and stale channel cache values", () => {
    const s3 = demoSeed.objects.find((object) => object.id === "prod-s3");
    const channel = demoSeed.objects.find(
      (object) => object.id === "sales-offline-dealer",
    );

    expect(s3?.fields.price?.value).toBe(1199);
    expect(channel?.fields.cached_price?.value).toBe(1299);
  });

  it("contains the low-confidence pending AI change and validation data carriers", () => {
    const aiChangeSet = demoSeed.changeSets.find(
      (changeSet) => changeSet.id === "changeset-ai-quote",
    );
    const lowConfidence = aiChangeSet?.items.find(
      (item) => item.id === "ai-launch",
    );

    expect(aiChangeSet?.status).toBe("pending");
    expect(
      aiChangeSet?.items.find((item) => item.id === "ai-price")?.applied,
    ).toBe(true);
    expect(
      aiChangeSet?.items.find((item) => item.id === "ai-contract")?.op,
    ).toBe("createObject");
    expect(lowConfidence?.confidence).toBe(0.74);
    expect(lowConfidence?.needsConfirm).toBe(true);
    const results = runValidationRules(
      new WorkspaceStore(demoSeed).getSnapshot(),
    );
    expect(results.filter((result) => result.level === "error")).toHaveLength(
      2,
    );
    expect(results.filter((result) => result.level === "warning")).toHaveLength(
      1,
    );
    expect(results.filter((result) => result.level === "passed")).toHaveLength(
      8,
    );
    expect(demoSeed.slotBindings[0]?.values.form_factor).toBe("mATX");
  });

  it("starts the activity stream with the storyline dashboard change", () => {
    expect(demoSeed.activity[0]?.summary).toBe("续航 12→14 + 看板加卡");
  });

  it("seeds the portal canvas with four nodes, three edges and editable permissions", () => {
    const canvas = demoSeed.views.find(
      (view) => view.id === "view-portal-canvas",
    );
    const config = canvas?.config as {
      nodes?: readonly { objectId: string }[];
      edges?: readonly { relationId: string }[];
    };

    expect(config.nodes?.map((node) => node.objectId)).toEqual([
      "prod-d2-pro",
      "prod-s3",
      "prod-e1",
      "prod-g2",
    ]);
    expect(config.edges?.map((edge) => edge.relationId)).toEqual([
      "rel-s3-g2-interconnect",
      "rel-d2pro-g2-interconnect",
      "rel-e1-g2-interconnect",
    ]);
    expect(demoSeed.permissions.wangyun["exp-portal"]).toBe("edit");
    expect(demoSeed.permissions.lixiao["exp-portal"]).toBe("edit");
    expect(demoSeed.permissions.chenmo["exp-portal"]).toBe("edit");
    expect(demoSeed.permissions.zhouran["exp-portal"]).toBe("readonly");
    expect(
      demoSeed.changeEvents
        .filter((event) => event.target.entityId === "view-portal-canvas")
        .every((event) => event.inverseView === null),
    ).toBe(true);
  });
});
