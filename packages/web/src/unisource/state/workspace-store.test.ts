import { afterEach, describe, expect, it, vi } from "vitest";

import type { Comment } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "./workspace-store";

describe("WorkspaceStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates a field with versions, inverse event, synced refs and publish", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const listener = vi.fn();
    store.subscribe(listener);

    const before = store.getObject("prod-s3")!;
    const result = store.updateField("prod-s3", "price", 1099, {
      actor: "wangyun",
    });
    const after = store.getObject("prod-s3")!;

    expect(result.syncedRefs).toBe(3);
    expect(after.version).toBe(before.version + 1);
    expect(after.fields.price?.fieldVersion).toBe(
      before.fields.price!.fieldVersion + 1,
    );
    expect(after.fields.price?.value).toBe(1099);
    expect(result.event.track).toBe("data");
    expect(result.event.inverse).toEqual({
      objectId: "prod-s3",
      fieldCode: "price",
      value: 1199,
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("undo restores by writing a new version instead of rolling back", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const update = store.updateField("prod-s3", "price", 1099, {
      actor: "wangyun",
    });

    store.undo(update.event.id);
    const restored = store.getObject("prod-s3")!;

    expect(restored.fields.price?.value).toBe(1199);
    expect(restored.version).toBe(3);
    expect(restored.fields.price?.fieldVersion).toBe(3);
  });

  it("marks affected refs as just synced and returns them to fresh", () => {
    vi.useFakeTimers();
    const store = new WorkspaceStore(cloneDemoSeed());

    store.updateField("prod-s3", "price", 1099, { actor: "wangyun" });

    expect(
      store.getFieldRefs("prod-s3", "price").map((ref) => ref.state),
    ).toEqual(["justSynced", "justSynced", "justSynced"]);
    expect(store.getFieldRefsByExpr("exp-spec-doc")).toHaveLength(10);

    vi.advanceTimersByTime(10000);

    expect(
      store.getFieldRefs("prod-s3", "price").map((ref) => ref.state),
    ).toEqual(["fresh", "fresh", "fresh"]);
  });

  it("adds and rebinds field refs on the view track", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const beforeRefs = store.getSnapshot().fieldRefs.length;

    const added = store.addFieldRef(
      "exp-spec-doc",
      "prod-s3",
      "rating",
      "防护认证",
    );
    const rebound = store.rebindFieldRef(
      "ref-weekly-presale-gift-dangling",
      "lifecycle",
    );

    expect(store.getSnapshot().fieldRefs).toHaveLength(beforeRefs + 1);
    expect(added.state).toBe("fresh");
    expect(rebound.fieldCode).toBe("lifecycle");
    expect(rebound.state).toBe("fresh");
    expect(
      store
        .getChangeEvents()
        .slice(0, 2)
        .map((event) => event.track),
    ).toEqual(["view", "view"]);
    expect(store.getChangeEvents()[0]?.inverse).toBeNull();
    expect(store.getActivity()[0]?.tracks).toEqual(["view"]);
  });

  it("creates objects and toggles KPI visibility through tracked writes", () => {
    const store = new WorkspaceStore(cloneDemoSeed());

    const object = store.createObject({
      objectTypeCode: "contracts",
      fields: { name: "测试合同", product: "门锁 S3" },
      actor: "wangyun",
      source: "ai",
    });
    const hidden = store.setKpiVisible("kpi-active-channels", false, "wangyun");

    expect(store.getObject(object.id)?.fields.name?.value).toBe("测试合同");
    expect(hidden.visible).toBe(false);
    expect(
      store
        .getChangeEvents()
        .slice(0, 2)
        .map((event) => event.track),
    ).toEqual(["view", "data"]);
  });

  it("can undo KPI visibility changes through the view track", () => {
    const store = new WorkspaceStore(cloneDemoSeed());

    const shown = store.setKpiVisible("kpi-ana-aov-net", true, "wangyun");
    store.undo(store.getChangeEvents()[0]!.id);

    expect(shown.visible).toBe(true);
    expect(
      store.getKpis().find((kpi) => kpi.id === "kpi-ana-aov-net")?.visible,
    ).toBe(false);
  });

  it("updates plugin registry state without business change events", () => {
    const seed = cloneDemoSeed();
    const store = new WorkspaceStore(seed);
    const beforeEvents = store.getChangeEvents().length;
    const beforeActivity = store.getActivity().length;

    store.setPluginState(
      "plug-finsuite",
      { installed: true, enabled: true },
      "wangyun",
    );
    store.setPluginState("plug-3d-assembly", { enabled: false }, "wangyun");
    store.setPluginState("plug-3d-assembly", { enabled: true }, "wangyun");
    store.setPluginState(
      "plug-3d-assembly",
      { version: "2.4", updateTo: null, scope: "group" },
      "wangyun",
    );

    expect(
      store.getPlugins().find((plugin) => plugin.id === "plug-finsuite"),
    ).toMatchObject({ installed: true, enabled: true });
    expect(
      store.getPlugins().find((plugin) => plugin.id === "plug-3d-assembly"),
    ).toMatchObject({
      enabled: true,
      version: "2.4",
      scope: "group",
    });
    expect(
      store.getPlugins().find((plugin) => plugin.id === "plug-3d-assembly")
        ?.updateTo,
    ).toBeUndefined();
    expect(store.getChangeEvents()).toHaveLength(beforeEvents);
    expect(store.getActivity()).toHaveLength(beforeActivity);

    store.reset(seed);
    expect(
      store.getPlugins().find((plugin) => plugin.id === "plug-3d-assembly"),
    ).toMatchObject({ enabled: true, version: "2.3", updateTo: "2.4" });
  });

  it("records review actions and binds slots", () => {
    const store = new WorkspaceStore(cloneDemoSeed());

    const review = store.addReviewRecord({
      target: { entityType: "field", entityId: "prod-s3", fieldCode: "price" },
      action: "accept",
      actor: "wangyun",
      note: "忽略校验项 XSRC-001",
    });
    const binding = store.bindSlot(
      { bindingId: "binding-z890-mainboard" },
      "hw-mb-prime-z890-p",
      { actor: "wangyun" },
    );

    expect(review.id).toContain("review-");
    expect(store.getReviewRecords()[0]?.note).toBe("忽略校验项 XSRC-001");
    expect(binding.objectId).toBe("hw-mb-prime-z890-p");
    expect(
      store
        .getSlotBindings()
        .find((item) => item.id === "binding-z890-mainboard")?.objectId,
    ).toBe("hw-mb-prime-z890-p");
  });

  it("unbinds slots through data-track events", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const before = store.getChangeEvents().length;

    const binding = store.unbindSlot(
      { bindingId: "binding-b860-mainboard" },
      { actor: "wangyun" },
    );

    expect(binding.objectId).toBeNull();
    expect(store.getChangeEvents()).toHaveLength(before + 1);
    expect(store.getChangeEvents()[0]?.track).toBe("data");
  });

  it("updates relation-owned fields without changing endpoint object versions", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const sourceVersion = store.getObject("prod-s3")!.version;
    const targetVersion = store.getObject("prod-g2")!.version;
    const beforeEvents = store.getChangeEvents().length;

    const result = store.updateRelationField(
      "rel-s3-g2-interconnect",
      "protocol",
      "Matter + BLE + Wi-Fi",
      { actor: "lixiao" },
    );

    expect(result.relation.version).toBe(2);
    expect(store.getChangeEvents()).toHaveLength(beforeEvents + 1);
    expect(store.getChangeEvents()[0]?.target).toEqual({
      entityType: "relation",
      entityId: "rel-s3-g2-interconnect",
    });
    expect(store.getChangeEvents()[0]?.inverse).toBeNull();
    expect(store.getActivity()[0]?.summary).toContain("更新关系字段");
    expect(result.relation.fields.protocol?.value).toBe("Matter + BLE + Wi-Fi");
    expect(store.getObject("prod-s3")?.version).toBe(sourceVersion);
    expect(store.getObject("prod-g2")?.version).toBe(targetVersion);
  });

  it("creates and unlinks relations with data events and activity", () => {
    const store = new WorkspaceStore(cloneDemoSeed());

    const created = store.createRelation({
      relationTypeCode: "interconnects_with",
      sourceId: "prod-s3",
      targetId: "prod-m1",
      actor: "lixiao",
    });
    const unlinked = store.unlinkRelation(created.relation.id, "lixiao");

    expect(created.relation.version).toBe(1);
    expect(unlinked.relation.status).toBe("unlinked");
    expect(unlinked.relation.version).toBe(2);
    expect(
      store
        .getChangeEvents()
        .slice(0, 2)
        .map((event) => event.target.entityType),
    ).toEqual(["relation", "relation"]);
    expect(store.getChangeEvents()[0]?.inverse).toBeNull();
    expect(store.getActivity()[0]?.summary).toContain("解除关系");
  });

  it("updates canvas view config on the view track and restores it by undo", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const before = store.getView("view-portal-canvas")!;

    const result = store.updateViewConfig(
      "view-portal-canvas",
      { nodes: [{ objectId: "prod-s3", x: 10, y: 20 }] },
      { actor: "wangyun", summary: "移动画布节点" },
    );

    expect(result.event.track).toBe("view");
    expect(result.event.inverseView?.config).toEqual(before.config);
    expect(store.getView("view-portal-canvas")?.config.nodes).toEqual([
      { objectId: "prod-s3", x: 10, y: 20 },
    ]);

    store.undo(result.event.id);

    expect(store.getView("view-portal-canvas")?.config).toEqual(before.config);
  });

  it("deletes objects, relations, field refs and canvas nodes together", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const affectedRefCount = store
      .getSnapshot()
      .fieldRefs.filter((ref) => ref.objectId === "prod-s3").length;

    store.deleteObject("prod-s3", "wangyun");

    expect(store.getObject("prod-s3")).toBeUndefined();
    expect(
      store
        .getRelations()
        .some(
          (relation) =>
            relation.sourceId === "prod-s3" || relation.targetId === "prod-s3",
        ),
    ).toBe(false);
    const refStates = store
      .getSnapshot()
      .fieldRefs.filter((ref) => ref.objectId === "prod-s3")
      .map((ref) => ref.state);
    expect(refStates).toHaveLength(affectedRefCount);
    expect(refStates.every((state) => state === "dangling")).toBe(true);
    expect(
      (
        store.getView("view-portal-canvas")?.config.nodes as {
          objectId: string;
        }[]
      ).map((node) => node.objectId),
    ).not.toContain("prod-s3");
  });

  it("can attach comments to a relation", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const comment: Comment = {
      id: "comment-new",
      anchor: { entityType: "relation", entityId: "rel-s3-g2-interconnect" },
      body: "协议标签已复核。",
      author: "lixiao",
      at: "2026-07-10T10:40:00+08:00",
      resolved: false,
    };

    const relation = store.addRelationComment(
      "rel-s3-g2-interconnect",
      comment,
    );

    expect(relation.annotationIds).toContain("comment-new");
    expect(store.getSnapshot().comments[0]).toBe(comment);
  });
});
