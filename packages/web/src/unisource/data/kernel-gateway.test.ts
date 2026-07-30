import { describe, expect, it } from "vitest";

import { buildAnaViewModel } from "../ana/ana-view-model";
import { buildBiBoardVm } from "../bi/bi-view-model";
import { buildCanvasViewModel } from "../canvas/canvas-view-model";
import { buildDocViewModel } from "../doc/doc-view-model";
import { buildMatrixViewModel } from "../matrix/matrix-view-model";
import type { DataObject } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { resolveExpressionView } from "../presentation/expression-runtime";
import { WorkspaceStore } from "../state/workspace-store";
import type { LatestCheckRun } from "./gateway";
import { KernelGateway, RELATION_LOAD_CONCURRENCY } from "./kernel-gateway";

describe("KernelGateway", () => {
  it("declares workspace-persistent expression configuration support", () => {
    const gateway = new KernelGateway("", "ws-1", "wangyun");
    expect(gateway.capabilities.expressionPersistence).toEqual({
      mode: "workspace-persistent",
      reason: null,
    });
  });

  it("maps the workspace-scoped catalog without loading records", async () => {
    const api = new FakeKernelApi();
    const catalog = await new KernelGateway(
      "",
      "ws-kernel",
      "wangyun",
      api.fetch,
    ).loadDataCatalog();

    expect(catalog).toEqual({
      workspaceId: "ws-kernel",
      directories: [
        {
          code: "data-source",
          name: "Data source",
          parentCode: null,
          sortOrder: 0,
        },
      ],
      libraries: [
        {
          objectTypeCode: "product_specs",
          directoryCode: "data-source",
          sortOrder: 0,
          recordCount: 2,
        },
      ],
    });
    expect(api.objectPageCalls).toEqual([]);
  });

  it("loads one catalog record page through the workspace-scoped object query", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(2);
    const requests: URL[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/views/objects")) requests.push(url);
      return api.fetch(input, init);
    };

    const page = await new KernelGateway(
      "",
      "ws-kernel",
      "wangyun",
      fetch,
    ).loadDataCatalogRecords("product_specs", 0, 50);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.searchParams.get("objectType")).toBe("product_specs");
    expect(requests[0]?.searchParams.get("pageSize")).toBe("50");
    expect(page).toMatchObject({
      objectTypeCode: "product_specs",
      page: 0,
      total: 2,
    });
    expect(page.items.map((item) => item.objectId)).toEqual([
      "kernel-prod-s3",
      "kernel-prod-g2",
    ]);
  });

  it("loads the user expression catalog once and merges it with the preset", async () => {
    const api = new FakeKernelApi();
    api.expressionConfigs.push(
      expressionConfigFixture("user-exp-grid", "user-view-grid", {
        name: "用户采购表",
        space: "main",
        defaultForm: "grid",
        view: {
          kind: "grid",
          config: { objectTypeCode: "product_specs", columns: ["name"] },
        },
      }),
    );
    const seed = await new KernelGateway(
      "",
      "ws-kernel",
      "wangyun",
      api.fetch,
    ).loadWorkspace();

    expect(api.expressionConfigCalls).toEqual(["GET"]);
    expect(seed.expressions.some((item) => item.id === "exp-dashboard")).toBe(
      true,
    );
    expect(seed.views.some((item) => item.id === "user-view-grid")).toBe(true);
    const state = new WorkspaceStore(seed).getSnapshot();
    expect(resolveExpressionView(state, "user-exp-grid", "grid").state).toBe(
      "ready",
    );
  });

  it("persists a user expression before atomically adding it to the store", async () => {
    const api = new FakeKernelApi();
    const store = new WorkspaceStore(cloneDemoSeed());
    const gateway = new KernelGateway(
      "",
      "ws-kernel",
      "wangyun",
      api.fetch,
    ).attachExpressionStore(store);
    const input = {
      name: "后端采购表",
      space: "main" as const,
      defaultForm: "grid" as const,
      view: {
        kind: "grid" as const,
        config: { objectTypeCode: "product_specs", columns: ["name"] },
      },
    };

    const first = gateway.createExpressionConfig(input);
    const duplicateClick = gateway.createExpressionConfig(input);
    expect(duplicateClick).toBe(first);
    const created = await first;

    expect(api.expressionConfigCalls).toEqual(["POST"]);
    expect(store.getSnapshot().expressions.at(-1)?.id).toBe(
      created.expression.id,
    );
    expect(store.getSnapshot().views.at(-1)?.id).toBe(created.view.id);
  });

  it("does not mutate the store when persistent expression creation fails", async () => {
    const api = new FakeKernelApi();
    api.failNextExpressionConfig = true;
    const store = new WorkspaceStore(cloneDemoSeed());
    const before = store.getSnapshot();
    const gateway = new KernelGateway(
      "",
      "ws-kernel",
      "wangyun",
      api.fetch,
    ).attachExpressionStore(store);

    await expect(
      gateway.createExpressionConfig({
        name: "失败表达",
        space: "main",
        defaultForm: "grid",
        view: {
          kind: "grid",
          config: { objectTypeCode: "product_specs", columns: [] },
        },
      }),
    ).rejects.toThrow("表达保存失败，请重试");
    expect(store.getSnapshot()).toBe(before);
  });

  it("rejects a persisted expression id collision instead of overwriting the preset", async () => {
    const api = new FakeKernelApi();
    api.expressionConfigs.push(
      expressionConfigFixture("exp-dashboard", "user-view-collision", {
        name: "冲突表达",
        space: "main",
        defaultForm: "grid",
        view: {
          kind: "grid",
          config: { objectTypeCode: "product_specs", columns: ["name"] },
        },
      }),
    );

    await expect(
      new KernelGateway("", "ws-kernel", "wangyun", api.fetch).loadWorkspace(),
    ).rejects.toThrow("用户表达标识与内置表达冲突");
  });

  it("loads paged objects and relations without bulk-loading history", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(101);
    api.relations.push({
      relationId: "kernel-rel-s3-g2",
      relationType: "interconnects_with",
      sourceId: "kernel-prod-s3",
      targetId: "kernel-prod-g2",
      version: 1,
    });
    api.history.set("kernel-prod-s3", [
      {
        eventId: "evt-price",
        seq: 1,
        kind: "edit",
        fieldCode: "price",
        before: 1299,
        after: 1199,
        actorKind: "user",
        actorId: "wangyun",
        actorDisplay: "王芸",
        source: "manual",
        objectVersion: 2,
        correlationId: null,
        occurredAt: "2026-07-10T10:24:00+08:00",
      },
    ]);
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const seed = await gateway.loadWorkspace();

    expect(seed.workspace.id).toBe("ws-kernel");
    expect(seed.objects).toHaveLength(101);
    expect(seed.relations).toHaveLength(1);
    expect(seed.changeEvents).toEqual([]);
    expect(api.historyCalls).toEqual([]);
    expect(gateway.getLastLoadReport()).toMatchObject({
      objectCount: 101,
      relationCount: 1,
      historyCount: 0,
    });

    const history = await gateway.loadObjectHistory("kernel-prod-s3");

    expect(history[0]?.target).toEqual({
      entityType: "field",
      entityId: "kernel-prod-s3",
      fieldCode: "price",
    });
    expect(gateway.getLastLoadReport()).toMatchObject({
      objectCount: 101,
      relationCount: 1,
      historyCount: 0,
    });
    expect(api.historyCalls).toEqual(["kernel-prod-s3"]);
    expect(api.objectPageCalls).toEqual([0, 1]);
  });

  it("coalesces concurrent workspace initialization requests", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(2);
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const first = gateway.loadWorkspace();
    const second = gateway.loadWorkspace();
    const [firstSeed, secondSeed] = await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(firstSeed).toBe(secondSeed);
    expect(api.objectPageCalls).toEqual([0]);
  });

  it("rejects an inaccessible workspace instead of loading a generic fallback", async () => {
    const api = new FakeKernelApi();
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/views/workspaces")) return json([]);
      return api.fetch(input, init);
    };
    const gateway = new KernelGateway(
      "",
      "missing-workspace",
      "wangyun",
      fetch,
    );

    await expect(gateway.loadWorkspace()).rejects.toThrow(
      "指定工作空间不存在或当前用户无权访问。",
    );
  });

  it("loads different object types concurrently while retaining complete pages", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(101);
    api.objectTypes.push({
      id: "type-supplier",
      code: "supplier",
      name: "Supplier",
      fields: [fieldType("name", "Name", "text")],
    });
    api.objects.push(
      viewObject("supplier-1", "supplier", { name: "供应商 A" }),
    );
    const objectPageGate = api.holdObjectPages(2);
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const load = gateway.loadWorkspace();
    await objectPageGate.started;
    expect(api.objectPageInFlight).toBe(2);
    objectPageGate.release();
    const seed = await load;

    expect(seed.objects).toHaveLength(102);
    expect(new Set(seed.objects.map((object) => object.id)).size).toBe(102);
    expect(api.objectPageCalls).toEqual([0, 0, 1]);
  });

  it("bounds concurrent relation reads and records individual failures", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(RELATION_LOAD_CONCURRENCY + 2);
    api.failObjectDetails.add("kernel-product-8");
    const detailGate = api.holdObjectDetails(RELATION_LOAD_CONCURRENCY);
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const load = gateway.loadWorkspace();
    await detailGate.started;
    expect(api.objectDetailInFlight).toBe(RELATION_LOAD_CONCURRENCY);
    expect(api.objectDetailPeak).toBe(RELATION_LOAD_CONCURRENCY);
    detailGate.release();
    const seed = await load;

    expect(seed.relations).toEqual([]);
    expect(gateway.getLastLoadReport()).toMatchObject({
      relationLoadFailures: 1,
    });
  });

  it("selects the pc procurement preset without mixing hardware demo content", async () => {
    const api = new FakeKernelApi();
    api.seedPcProcurement();
    const rawPlan = api.objects.find(
      (object) => object.objectId === "kernel-pc-valid",
    )!;
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const seed = await gateway.loadWorkspace();

    expect(seed.workspace.name).toBe("电脑采购工作空间");
    expect(seed.objectTypes.map((type) => type.code)).toEqual([
      "procurement_requirement",
      "build_plan",
      "build_plan_item",
      "hardware_product",
      "supplier_quote",
    ]);
    expect(seed.objects.map((object) => object.id)).toEqual([
      "kernel-pc-requirement",
      "kernel-pc-valid",
      "kernel-pc-invalid",
      "kernel-pc-valid-cpu-item",
      "kernel-pc-valid-cpu-product",
      "kernel-pc-valid-cpu-quote",
    ]);
    expect(seed.expressions.map((expression) => expression.name)).toContain(
      "电脑采购总览",
    );
    expect(JSON.stringify(seed)).not.toMatch(/智能门锁|渠道经营看板|S3/);
    expect(
      seed.fieldRefs.every((ref) => ref.objectId === "kernel-pc-valid"),
    ).toBe(true);
    expect(seed.fieldRefs.every((ref) => ref.state !== "dangling")).toBe(true);
    expect(seed.relations).toHaveLength(6);
    expect(rawPlan.fields).not.toHaveProperty("total_price_cny_fx");
    expect(rawPlan.derived).toMatchObject({ total_price_cny_fx: 8783 });

    const doc = buildDocViewModel(seed, seed.docModels[0]!);
    expect(doc.refs.map((ref) => [ref.fieldCode, ref.value])).toEqual(
      expect.arrayContaining([
        ["code", "PLAN-STD"],
        ["name", "标准开发配置(约8000元)"],
        ["status", "PROPOSED"],
        ["total_price_cny_fx", 8783],
        ["total_power_w_fx", 460],
        ["total_performance_score_fx", 560],
      ]),
    );
    expect(doc.danglingCount).toBe(0);

    const canvasView = seed.views.find((view) => view.id === "view-pc-canvas")!;
    const canvas = buildCanvasViewModel(seed, canvasView);
    expect(canvas.nodes.map((node) => node.objectId)).toEqual([
      "kernel-pc-valid",
      "kernel-pc-requirement",
      "kernel-pc-valid-cpu-item",
      "kernel-pc-valid-cpu-product",
      "kernel-pc-valid-cpu-quote",
    ]);
    expect(canvas.edges.map((edge) => edge.relationId)).toEqual([
      "kernel-rel-pc-valid-satisfies",
      "kernel-rel-pc-valid-contains-cpu",
      "kernel-rel-pc-valid-cpu-selects-product",
      "kernel-rel-pc-valid-cpu-uses-quote",
      "kernel-rel-pc-valid-cpu-quote-for-product",
    ]);
    expect(canvas.danglingRefs).toEqual([]);

    const matrixView = seed.views.find((view) => view.id === "view-pc-matrix")!;
    const matrix = buildMatrixViewModel(seed, matrixView);
    expect(matrix.state).toBe("ready");
    expect(matrix.allowColumnMove).toBe(false);
    expect(matrix.cards[0]?.fields.map((field) => field.text)).toEqual([
      "8783",
      "10000",
      "460",
      "650",
      "560",
      "750",
      "0",
      "0",
    ]);

    const biView = seed.views.find((view) => view.id === "view-pc-bi")!;
    const bi = buildBiBoardVm(seed, biView);
    expect(bi.title).toBe("采购指标");
    expect(bi.sourceLabel).toBe("当前电脑采购工作空间");
    expect(bi.kpis[0]).toMatchObject({ label: "方案数量", value: "2" });
    expect(bi.kpis.map((kpi) => kpi.label)).toEqual(
      expect.arrayContaining([
        "需求数量",
        "硬件配件数量",
        "供应商数量",
        "供应商报价数量",
        "方案总价",
        "需求单台预算",
        "方案总功耗",
        "需求最大总功耗",
        "方案性能分",
        "电源容量",
        "报价库存（明细）",
        "BLOCK 校验",
        "WARN 校验",
        "PASS 校验",
      ]),
    );
    expect(bi.barGroups.map((group) => group.title)).toEqual(
      expect.arrayContaining(["方案总价", "方案总功耗", "方案性能分"]),
    );
    expect(bi.bars.map((bar) => bar.value)).toEqual([8783, 12872]);

    const report = seed.anaReports.find(
      (item) => item.id === "ana-pc-plan-comparison",
    )!;
    const anaView = seed.views.find((view) => view.id === "view-pc-ana")!;
    const analysis = buildAnaViewModel(
      seed,
      report,
      anaView.config.anaComparison,
      [],
      "ready",
    );
    expect(analysis.report.factorTitle).toBe("方案因素");
    expect(analysis.comparison?.state).toBe("ready");
    expect(
      analysis.comparison?.columns.map((column) => column.fieldCode),
    ).toEqual(
      expect.arrayContaining([
        "total_price_cny_fx",
        "total_power_w_fx",
        "total_performance_score_fx",
        "power_supply_capacity_w_fx",
        "quote_inventory_fx",
      ]),
    );
    expect(
      analysis.comparison?.rows.map((row) => row.values.totalPrice),
    ).toEqual(["8783 CNY", "12872 CNY"]);
    expect(analysis.comparison?.rows.map((row) => row.status)).toEqual([
      "ok",
      "ok",
    ]);
  });

  it("uses the minimal generic preset for an unknown profile", async () => {
    const api = new FakeKernelApi();
    api.templateCode = "future_profile";
    api.seedObjects(2);
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const seed = await gateway.loadWorkspace();

    expect(seed.expressions).toEqual([
      expect.objectContaining({ id: "exp-generic-data", name: "数据工作台" }),
    ]);
    expect(seed.views).toEqual([
      expect.objectContaining({ id: "view-generic-grid", kind: "grid" }),
    ]);
    expect(seed.docModels).toEqual([]);
    expect(seed.fieldRefs).toEqual([]);
    expect(seed.kpis).toEqual([]);
    expect(seed.anaReports).toEqual([]);
    expect(seed.objects).toHaveLength(2);
  });

  it("seeds demo data idempotently and skips missing types", async () => {
    const api = new FakeKernelApi();
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const first = await gateway.seedDemoData(cloneDemoSeed());
    const second = await gateway.seedDemoData(cloneDemoSeed());

    expect(first.createdObjects).toBe(8);
    expect(first.createdRelations).toBe(3);
    expect(first.skippedObjects).toBeGreaterThan(0);
    expect(first.missingTypes).toContain("hardware_products");
    expect(second.createdObjects).toBe(0);
    expect(second.createdRelations).toBe(0);
    expect(second.skippedObjects).toBeGreaterThanOrEqual(first.createdObjects);
    expect(second.skippedRelations).toBeGreaterThanOrEqual(
      first.createdRelations,
    );
  });

  it("never submits the door demo seed for pc or unknown profiles", async () => {
    for (const templateCode of ["pc_procurement", "future_profile"]) {
      const api = new FakeKernelApi();
      api.templateCode = templateCode;
      const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

      const report = await gateway.seedDemoData();

      expect(api.commands).toEqual([]);
      expect(report.createdObjects).toBe(0);
      expect(report.createdRelations).toBe(0);
      expect(report.failed[0]).toContain(templateCode);
    }
  });

  it("posts UpdateFields with object version locking and no field version", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(2);
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);
    gateway.setActor("lixiao");

    await gateway.updateField("kernel-prod-s3", "price", 1000, {
      actor: "lixiao",
      expectedObjectVersion: 1,
    });

    expect(api.commands[0]).toMatchObject({
      actorId: "lixiao",
      commandType: "UpdateFields",
      payload: {
        objectId: "kernel-prod-s3",
        expectedObjectVersion: 1,
        fields: [{ fieldDefCode: "price", value: 1000 }],
      },
    });
    expect(
      (
        api.commands[0]?.payload.fields as { expectedFieldVersion?: number }[]
      )[0]?.expectedFieldVersion,
    ).toBeUndefined();
  });

  it("creates objects through resolved object type ids and claims read-model ids", async () => {
    const api = new FakeKernelApi();
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const object = await gateway.createObject({
      objectTypeCode: "product_specs",
      fields: { name: "Bridge Product", price: 42 },
      actor: "wangyun",
    });

    expect(api.commands[0]).toMatchObject({
      commandType: "CreateObject",
      payload: {
        objectTypeId: "type-product",
        fields: { name: "Bridge Product", price: 42 },
      },
    });
    expect(object.id).toBe("created-object-1");
    expect(object.fields.name?.value).toBe("Bridge Product");
  });

  it("creates relations through resolved relation type ids and claims relation ids", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(2);
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const result = await gateway.createRelation({
      relationTypeCode: "interconnects_with",
      sourceId: "kernel-prod-s3",
      targetId: "kernel-prod-g2",
      actor: "wangyun",
    });

    expect(api.commands[0]).toMatchObject({
      commandType: "CreateRelation",
      payload: {
        relationTypeId: "reltype-interconnect",
        sourceId: "kernel-prod-s3",
        targetId: "kernel-prod-g2",
      },
    });
    expect(result.relation.id).toBe("created-relation-1");
  });

  it("unlinks a relation through the kernel Unlink command", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(2);
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const result = await gateway.unlinkRelation({
      relation: {
        id: "relation-1",
        relationTypeCode: "interconnects_with",
        sourceId: "kernel-prod-s3",
        targetId: "kernel-prod-g2",
        status: "active",
        fields: {},
        version: 7,
        annotationIds: [],
      },
      expectedVersion: 7,
      actor: "wangyun",
    });

    expect(api.commands[0]).toMatchObject({
      commandType: "Unlink",
      payload: { relationId: "relation-1", expectedVersion: 7 },
    });
    expect(result.relation.status).toBe("unlinked");
  });

  it("archives objects with the supplied expected version", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(2);
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    await gateway.deleteObject("kernel-prod-s3", "wangyun", 5);

    expect(api.commands[0]).toMatchObject({
      commandType: "Archive",
      payload: {
        targetType: "object",
        targetId: "kernel-prod-s3",
        expectedVersion: 5,
      },
    });
  });

  it("runs kernel rule checks with the current actor", async () => {
    const api = new FakeKernelApi();
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);
    gateway.setActor("lixiao");

    const runId = await gateway.runRuleCheck("build_plan");

    expect(runId).toBe("kernel-run-1");
    expect(api.ruleCommands[0]).toMatchObject({
      actorId: "lixiao",
      commandType: "RunRuleCheck",
      payload: { scope: { objectTypeCode: "build_plan" } },
    });
  });

  it("loads the most recent completed kernel rule run", async () => {
    const api = new FakeKernelApi();
    api.latestCheckRun = {
      runId: "kernel-run-persisted",
      scopeObjectTypeCode: "build_plan",
      status: "COMPLETED",
      completedAt: "2026-07-17T09:30:00Z",
    };
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    await expect(gateway.latestCheckRun()).resolves.toMatchObject({
      runId: "kernel-run-persisted",
      scopeObjectTypeCode: "build_plan",
    });
  });

  it("loads paged kernel check results and maps them into rule outcomes", async () => {
    const api = new FakeKernelApi();
    api.checkResults = [
      kernelCheck("RULE-1", "BLOCK", "prod-s3", "price"),
      kernelCheck("RULE-2", "WARN", "prod-g2", null),
      kernelCheck("RULE-3", "OK", "prod-m1", null),
      ...Array.from({ length: 48 }, (_, index) =>
        kernelCheck(`RULE-${index + 4}`, "OK", `prod-extra-${index}`, null),
      ),
    ];
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const results = await gateway.checkResults("kernel-run-1");

    expect(api.checkResultPageCalls).toEqual([0, 1]);
    expect(results.slice(0, 3).map((result) => result.ruleCode)).toEqual([
      "RULE-1",
      "RULE-2",
      "RULE-3",
    ]);
    expect(results[0]).toMatchObject({
      level: "error",
      runId: "kernel-run-1",
      createdAt: "2026-07-10T10:24:00+08:00",
      target: {
        entityType: "field",
        entityId: "prod-s3",
        fieldCode: "price",
      },
    });
  });

  it("surfaces rule command errors", async () => {
    const api = new FakeKernelApi();
    api.ruleCommandReturnsRunId = false;
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    await expect(gateway.runRuleCheck()).rejects.toThrow(
      "RunRuleCheck 未返回 runId",
    );
  });

  it("lists kernel AI change sets from the read model", async () => {
    const api = new FakeKernelApi();
    api.aiChangeSets = [kernelAiChangeSet("ai-set-1")];
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const changeSets = await gateway.listAiChanges();

    expect(changeSets[0]).toMatchObject({
      id: "ai-set-1",
      status: "pending",
      items: [
        {
          id: "ai-item-1",
          target: {
            entityType: "field",
            entityId: "kernel-prod-s3",
            fieldCode: "price",
          },
        },
      ],
    });
    expect(api.aiChangeActorIds).toEqual(["wangyun"]);
  });

  it("confirms selected kernel AI items through ai-commands", async () => {
    const api = new FakeKernelApi();
    api.aiChangeSets = [kernelAiChangeSet("ai-set-1")];
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);
    gateway.setActor("lixiao");

    const result = await gateway.confirmAiChange("ai-set-1", ["ai-item-1"]);

    expect(result.ok).toBe(true);
    expect(api.aiCommands[0]).toMatchObject({
      actorId: "lixiao",
      commandType: "ConfirmAiChange",
      payload: { setId: "ai-set-1", itemIds: ["ai-item-1"] },
    });
    expect(api.aiChangeSetFilters).toContain("ai-set-1");
  });

  it("rejects kernel AI change sets through ai-commands", async () => {
    const api = new FakeKernelApi();
    api.aiChangeSets = [kernelAiChangeSet("ai-set-1")];
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    await gateway.rejectAiChange("ai-set-1");

    expect(api.aiCommands[0]).toMatchObject({
      commandType: "RejectAiChange",
      payload: { setId: "ai-set-1" },
    });
  });

  it("reads and writes review annotations with the current actor", async () => {
    const api = new FakeKernelApi();
    api.annotations = [
      kernelAnnotation("ann-1", "object", "kernel-prod-s3", null),
    ];
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);
    gateway.setActor("lixiao");

    const listed = await gateway.listAnnotations({
      entityType: "object",
      entityId: "kernel-prod-s3",
    });
    const created = await gateway.createAnnotation({
      target: {
        entityType: "field",
        entityId: "kernel-prod-s3",
        fieldCode: "price",
      },
      body: "Needs review",
      severity: "warn",
      anchoredDataVersion: 2,
    });
    const resolved = await gateway.resolveAnnotation("ann-1");
    const reopened = await gateway.reopenAnnotation("ann-1");

    expect(listed[0]).toMatchObject({
      id: "ann-1",
      anchor: { entityType: "object", entityId: "kernel-prod-s3" },
    });
    expect(created).toMatchObject({
      body: "Needs review",
      severity: "warn",
      anchor: {
        entityType: "field",
        entityId: "kernel-prod-s3",
        fieldCode: "price",
      },
    });
    expect(resolved.resolved).toBe(true);
    expect(reopened.resolved).toBe(false);
    expect(api.annotationQueries[0]).toEqual({
      targetType: "object",
      targetId: "kernel-prod-s3",
      fieldCode: null,
    });
    expect(api.reviewCommands.map((command) => command.commandType)).toEqual([
      "CreateAnnotation",
      "ResolveAnnotation",
      "ReopenAnnotation",
    ]);
    expect(api.reviewCommands[0]).toMatchObject({
      actorId: "lixiao",
      payload: {
        targetType: "field",
        targetId: "kernel-prod-s3",
        fieldCode: "price",
        anchoredDataVersion: 2,
        severity: "warn",
        body: "Needs review",
        roundId: null,
      },
    });
  });

  it("previews and applies structured exchange imports", async () => {
    const api = new FakeKernelApi();
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);
    gateway.setActor("chenmo");

    const preview = await gateway.exchangePreview("json", '{"objects":[]}');
    const apply = await gateway.exchangeApply("reqif", "<REQ-IF />");

    expect(preview.summary.objectsAdded).toBe(1);
    expect(api.exchangePreviews[0]).toEqual({
      format: "json",
      base: "current",
      payload: '{"objects":[]}',
    });
    expect(apply).toMatchObject({
      applied: ["object:prod-new"],
      unapplied: [{ item: "relation:bad" }],
    });
    expect(api.exchangeApplies[0]).toEqual({
      actorId: "chenmo",
      format: "reqif",
      payload: { reqif: "<REQ-IF />", confirmRemovals: false },
    });
  });

  it("surfaces structured exchange endpoint errors", async () => {
    const api = new FakeKernelApi();
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    api.failNextExchangePreview = true;
    await expect(gateway.exchangePreview("json", "{}")).rejects.toThrow(
      "交换预览失败",
    );

    api.failNextExchangeApply = true;
    await expect(gateway.exchangeApply("json", "{}")).rejects.toMatchObject({
      code: "KERNEL-422-SCHEMA-INVALID",
    });
  });

  it("reads field lineage from the kernel read model", async () => {
    const api = new FakeKernelApi();
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    const lineage = await gateway.lineage("kernel-prod-s3", "price");

    expect(api.lineageQueries).toEqual([
      { objectId: "kernel-prod-s3", fieldCode: "price" },
    ]);
    expect(lineage).toMatchObject({
      objectId: "kernel-prod-s3",
      fieldCode: "price",
      algorithm: { kind: "derived", ref: "fx.margin" },
      partial: false,
      truncated: true,
    });
    expect(lineage.upstream[0]).toMatchObject({
      objectId: "kernel-prod-g2",
      fieldCode: "cost",
      depth: 1,
    });
    expect(lineage.downstream[0]).toMatchObject({
      kind: "rule",
      ref: "R-PRICE-001",
      depth: 2,
    });
  });

  it("surfaces lineage read errors", async () => {
    const api = new FakeKernelApi();
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);
    api.failNextLineage = true;

    await expect(gateway.lineage("kernel-prod-s3", "price")).rejects.toThrow(
      "读取视图数据失败",
    );
  });

  it("captures snapshots, creates outputs and reads artifacts with the current actor", async () => {
    const api = new FakeKernelApi();
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);
    gateway.setActor("lixiao");

    const snapshot = await gateway.captureSnapshot("hardware_products");
    const output = await gateway.createOutput(snapshot.snapshotId, "docx", {
      templateId: "tpl-install-v1",
      objectType: "hardware_products",
    });
    const artifact = await gateway.getOutput(output.outputId);

    expect(api.snapshots[0]).toEqual({
      actorId: "lixiao",
      payload: { scopeObjectType: "hardware_products" },
    });
    expect(api.outputs[0]).toEqual({
      actorId: "lixiao",
      payload: {
        snapshotId: "snapshot-1",
        format: "docx",
        templateId: "tpl-install-v1",
        templateVersion: null,
        objectType: "hardware_products",
        fieldOrder: null,
      },
    });
    expect(output).toMatchObject({
      outputId: "output-1",
      snapshotId: "snapshot-1",
      format: "docx",
      createdBy: "lixiao",
    });
    expect(artifact).toMatchObject({
      outputId: "output-1",
      format: "docx",
      artifact: "ZG9jeA==",
    });
  });

  it("surfaces output endpoint errors", async () => {
    const api = new FakeKernelApi();
    api.failNextSnapshot = true;
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    await expect(gateway.captureSnapshot()).rejects.toThrow("写入视图制品失败");
  });

  it("maps command failures into write rejections", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(2);
    api.failNextUpdate = true;
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    await expect(
      gateway.updateField("kernel-prod-s3", "price", 1000, {
        actor: "wangyun",
        expectedObjectVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "KERNEL-409-VERSION-CONFLICT",
      title: "乐观版本冲突",
      currentVersion: 2,
      conflictingFields: [
        {
          fieldCode: "price",
          currentValue: 1199,
          changedBy: "lixiao",
        },
      ],
    });
  });

  it("preserves backend permission rejections", async () => {
    const api = new FakeKernelApi();
    api.seedObjects(2);
    api.failNextForbidden = true;
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    await expect(
      gateway.updateField("kernel-prod-s3", "price", 1000, {
        actor: "wangyun",
        expectedObjectVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "PERM-403-FIELD-DENIED",
      title: "字段级权限拒绝",
    });
  });
});

class FakeKernelApi {
  templateCode: string | null = "hardware_products";
  workspaceName = "Kernel Workspace";
  readonly objectTypes = [
    {
      id: "type-product",
      code: "product_specs",
      name: "Product Specs",
      fields: [
        {
          code: "name",
          name: "Name",
          dataType: "text",
          required: true,
          constraints: {},
        },
        {
          code: "price",
          name: "Price",
          dataType: "number",
          required: false,
          constraints: {},
        },
      ],
    },
  ];
  readonly relationTypes = [
    {
      id: "reltype-interconnect",
      code: "interconnects_with",
      name: "Interconnects",
      hierarchical: false,
    },
  ];
  readonly objects: ViewObjectFixture[] = [];
  readonly relations: RelationFixture[] = [];
  readonly history = new Map<string, HistoryFixture[]>();
  readonly historyCalls: string[] = [];
  readonly objectDetailCalls: string[] = [];
  readonly failObjectDetails = new Set<string>();
  readonly objectPageCalls: number[] = [];
  expressionConfigs: ExpressionConfigFixture[] = [];
  readonly expressionConfigCalls: string[] = [];
  failNextExpressionConfig = false;
  readonly commands: {
    readonly actorId: string | null;
    readonly commandType: string;
    readonly payload: Record<string, unknown>;
  }[] = [];
  readonly ruleCommands: {
    readonly actorId: string | null;
    readonly commandType: string;
    readonly payload: Record<string, unknown>;
  }[] = [];
  readonly aiCommands: {
    readonly actorId: string | null;
    readonly commandType: string;
    readonly payload: Record<string, unknown>;
  }[] = [];
  readonly snapshots: {
    readonly actorId: string | null;
    readonly payload: Record<string, unknown>;
  }[] = [];
  readonly outputs: {
    readonly actorId: string | null;
    readonly payload: Record<string, unknown>;
  }[] = [];
  readonly reviewCommands: {
    readonly actorId: string | null;
    readonly commandType: string;
    readonly payload: Record<string, unknown>;
  }[] = [];
  readonly exchangePreviews: {
    readonly format: string;
    readonly base: string | null;
    readonly payload: string;
  }[] = [];
  readonly exchangeApplies: {
    readonly actorId: string | null;
    readonly format: string;
    readonly payload: Record<string, unknown>;
  }[] = [];
  readonly lineageQueries: {
    readonly objectId: string | null;
    readonly fieldCode: string | null;
  }[] = [];
  readonly annotationQueries: {
    readonly targetType: string | null;
    readonly targetId: string | null;
    readonly fieldCode: string | null;
  }[] = [];
  aiChangeSets: AiChangeSetFixture[] = [];
  annotations: ReviewAnnotationFixture[] = [];
  readonly aiChangeActorIds: (string | null)[] = [];
  readonly aiChangeSetFilters: (string | null)[] = [];
  checkResults: CheckResultFixture[] = [];
  latestCheckRun: LatestCheckRun = {
    runId: null,
    scopeObjectTypeCode: null,
    status: null,
    completedAt: null,
  };
  readonly checkResultPageCalls: number[] = [];
  failNextUpdate = false;
  failNextForbidden = false;
  failNextSnapshot = false;
  failNextExchangePreview = false;
  failNextExchangeApply = false;
  failNextLineage = false;
  ruleCommandReturnsRunId = true;
  private objectSequence = 0;
  private relationSequence = 0;
  objectDetailInFlight = 0;
  objectDetailPeak = 0;
  objectPageInFlight = 0;
  private objectDetailGate: Promise<void> | null = null;
  private releaseObjectDetails: (() => void) | null = null;
  private objectDetailStartTarget = 0;
  private resolveObjectDetailStart: (() => void) | null = null;
  private objectPageGate: Promise<void> | null = null;
  private releaseObjectPages: (() => void) | null = null;
  private objectPageStartTarget = 0;
  private resolveObjectPageStart: (() => void) | null = null;

  holdObjectDetails(target: number): {
    readonly started: Promise<void>;
    readonly release: () => void;
  } {
    this.objectDetailStartTarget = target;
    const started = new Promise<void>((resolve) => {
      this.resolveObjectDetailStart = resolve;
    });
    this.objectDetailGate = new Promise<void>((resolve) => {
      this.releaseObjectDetails = resolve;
    });
    return {
      started,
      release: () => this.releaseObjectDetails?.(),
    };
  }

  holdObjectPages(target: number): {
    readonly started: Promise<void>;
    readonly release: () => void;
  } {
    this.objectPageStartTarget = target;
    const started = new Promise<void>((resolve) => {
      this.resolveObjectPageStart = resolve;
    });
    this.objectPageGate = new Promise<void>((resolve) => {
      this.releaseObjectPages = resolve;
    });
    return {
      started,
      release: () => this.releaseObjectPages?.(),
    };
  }

  readonly fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/views/workspaces")) {
      return json([
        {
          workspaceId: "ws-kernel",
          name: this.workspaceName,
          templateCode: this.templateCode,
          updatedAt: "2026-07-10T10:24:00+08:00",
        },
      ]);
    }
    if (url.pathname.endsWith("/data-catalog")) {
      return json({
        workspaceId: "ws-kernel",
        directories: [
          {
            code: "data-source",
            name: "Data source",
            parentCode: null,
            sortOrder: 0,
          },
        ],
        libraries: [
          {
            objectTypeCode: "product_specs",
            directoryCode: "data-source",
            sortOrder: 0,
            recordCount: 2,
          },
        ],
      });
    }
    if (url.pathname.endsWith("/expression-configs")) {
      this.expressionConfigCalls.push(init?.method ?? "GET");
      if (init?.method !== "POST") return json(this.expressionConfigs);
      if (this.failNextExpressionConfig) {
        this.failNextExpressionConfig = false;
        return json({ error: { message: "表达保存失败，请重试" } }, 500);
      }
      const request = JSON.parse(
        String(init.body),
      ) as ExpressionConfigRequestFixture;
      const created = expressionConfigFixture(
        `user-exp-${this.expressionConfigs.length + 1}`,
        `user-view-${this.expressionConfigs.length + 1}`,
        request,
        readHeader(init.headers, "X-Actor-Id") ?? "unknown",
      );
      this.expressionConfigs.push(created);
      return json(created);
    }
    if (url.pathname.endsWith("/views/object-types")) {
      return json(this.objectTypes);
    }
    if (url.pathname.endsWith("/views/relation-types")) {
      return json(this.relationTypes);
    }
    if (url.pathname.endsWith("/views/objects")) {
      const page = Number(url.searchParams.get("page") ?? "0");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "100");
      const objectType = url.searchParams.get("objectType");
      const objects = this.objects.filter(
        (object) => !objectType || object.objectType === objectType,
      );
      this.objectPageCalls.push(page);
      this.objectPageInFlight += 1;
      if (this.objectPageCalls.length === this.objectPageStartTarget) {
        this.resolveObjectPageStart?.();
      }
      try {
        await this.objectPageGate;
        const items = objects.slice(page * pageSize, (page + 1) * pageSize);
        return json({ items, page, pageSize, total: objects.length });
      } finally {
        this.objectPageInFlight -= 1;
      }
    }
    const objectDetail = url.pathname.match(/\/views\/objects\/([^/]+)$/);
    if (objectDetail) {
      const objectId = objectDetail[1] ?? "";
      this.objectDetailCalls.push(objectId);
      this.objectDetailInFlight += 1;
      this.objectDetailPeak = Math.max(
        this.objectDetailPeak,
        this.objectDetailInFlight,
      );
      if (this.objectDetailCalls.length === this.objectDetailStartTarget) {
        this.resolveObjectDetailStart?.();
      }
      try {
        await this.objectDetailGate;
        if (this.failObjectDetails.has(objectId)) {
          return json({ message: "object detail failed" }, 500);
        }
        return json({
          object: this.objects.find((object) => object.objectId === objectId),
          relations: this.relations.filter(
            (relation) =>
              relation.sourceId === objectId || relation.targetId === objectId,
          ),
        });
      } finally {
        this.objectDetailInFlight -= 1;
      }
    }
    const history = url.pathname.match(/\/views\/objects\/([^/]+)\/history$/);
    if (history) {
      const objectId = history[1] ?? "";
      this.historyCalls.push(objectId);
      return json({
        items: this.history.get(objectId) ?? [],
        page: 0,
        pageSize: 30,
        total: this.history.get(objectId)?.length ?? 0,
      });
    }
    if (url.pathname.endsWith("/snapshots") && init?.method === "POST") {
      if (this.failNextSnapshot) {
        this.failNextSnapshot = false;
        return json({ message: "snapshot failed" }, 500);
      }
      const payload = JSON.parse(String(init.body ?? "{}")) as Record<
        string,
        unknown
      >;
      this.snapshots.push({
        actorId: readHeader(init.headers, "X-Actor-Id"),
        payload,
      });
      return json({
        snapshotId: `snapshot-${this.snapshots.length}`,
        createdAt: "2026-07-10T10:24:00+08:00",
        createdBy: readHeader(init.headers, "X-Actor-Id") ?? "wangyun",
        dataVersion: 7,
        contentHash: "snapshot-hash",
        scopeObjectType: payload.scopeObjectType ?? null,
      });
    }
    const outputDetail = url.pathname.match(/\/outputs\/([^/]+)$/);
    if (outputDetail) {
      const outputId = outputDetail[1] ?? "";
      return json({
        meta: outputMeta(outputId, "snapshot-1", "docx", "lixiao"),
        artifact: "ZG9jeA==",
      });
    }
    if (url.pathname.endsWith("/outputs") && init?.method === "POST") {
      const payload = JSON.parse(String(init.body ?? "{}")) as Record<
        string,
        unknown
      >;
      this.outputs.push({
        actorId: readHeader(init.headers, "X-Actor-Id"),
        payload,
      });
      return json(
        outputMeta(
          `output-${this.outputs.length}`,
          String(payload.snapshotId),
          String(payload.format),
          readHeader(init.headers, "X-Actor-Id") ?? "wangyun",
        ),
      );
    }
    if (url.pathname.endsWith("/rule-commands") && init?.method === "POST") {
      return this.handleRuleCommand(String(init.body ?? "{}"), init);
    }
    if (url.pathname.endsWith("/views/latest-check-run")) {
      return json(this.latestCheckRun);
    }
    if (url.pathname.endsWith("/views/check-results")) {
      const page = Number(url.searchParams.get("page") ?? "0");
      const size = Number(url.searchParams.get("size") ?? "50");
      this.checkResultPageCalls.push(page);
      return json({
        items: this.checkResults.slice(page * size, (page + 1) * size),
        page,
        pageSize: size,
        total: this.checkResults.length,
      });
    }
    if (url.pathname.endsWith("/views/lineage")) {
      if (this.failNextLineage) {
        this.failNextLineage = false;
        return json({ message: "lineage failed" }, 500);
      }
      this.lineageQueries.push({
        objectId: url.searchParams.get("objectId"),
        fieldCode: url.searchParams.get("fieldCode"),
      });
      return json(lineageFixture());
    }
    if (url.pathname.endsWith("/views/ai-changes")) {
      this.aiChangeActorIds.push(readHeader(init?.headers, "X-Actor-Id"));
      const setId = url.searchParams.get("setId");
      this.aiChangeSetFilters.push(setId);
      return json(
        setId
          ? this.aiChangeSets.filter((changeSet) => changeSet.setId === setId)
          : this.aiChangeSets,
      );
    }
    if (url.pathname.endsWith("/ai-commands") && init?.method === "POST") {
      return this.handleAiCommand(String(init.body ?? "{}"), init);
    }
    if (url.pathname.endsWith("/annotations")) {
      const query = {
        targetType: url.searchParams.get("targetType"),
        targetId: url.searchParams.get("targetId"),
        fieldCode: url.searchParams.get("fieldCode"),
      };
      this.annotationQueries.push(query);
      return json(
        this.annotations.filter(
          (annotation) =>
            annotation.targetType === query.targetType &&
            annotation.targetId === query.targetId &&
            (annotation.fieldCode ?? null) === query.fieldCode,
        ),
      );
    }
    if (url.pathname.endsWith("/review/commands") && init?.method === "POST") {
      return this.handleReviewCommand(String(init.body ?? "{}"), init);
    }
    const exchange = url.pathname.match(/\/exchange\/([^/]+)\/([^/]+)$/);
    if (exchange && init?.method === "POST") {
      const format = exchange[1] ?? "";
      const action = exchange[2] ?? "";
      if (action === "preview") {
        if (this.failNextExchangePreview) {
          this.failNextExchangePreview = false;
          return json({ message: "preview failed" }, 500);
        }
        this.exchangePreviews.push({
          format,
          base: url.searchParams.get("base"),
          payload: String(init.body ?? ""),
        });
        return json(exchangeDiffFixture());
      }
      if (action === "apply") {
        if (this.failNextExchangeApply) {
          this.failNextExchangeApply = false;
          return json(
            {
              error: {
                code: "KERNEL-422-SCHEMA-INVALID",
                title: "Schema invalid",
              },
            },
            422,
          );
        }
        this.exchangeApplies.push({
          actorId: readHeader(init.headers, "X-Actor-Id"),
          format,
          payload: JSON.parse(String(init.body ?? "{}")) as Record<
            string,
            unknown
          >,
        });
        return json({
          diff: exchangeDiffFixture(),
          applied: ["object:prod-new"],
          unapplied: [
            {
              item: "relation:bad",
              error: {
                code: "KERNEL-422-SCHEMA-INVALID",
                title: "Schema invalid",
              },
            },
          ],
        });
      }
    }
    if (url.pathname.endsWith("/commands") && init?.method === "POST") {
      return this.handleCommand(String(init.body ?? "{}"), init);
    }
    return json({ message: "not found" }, 404);
  };

  seedPcProcurement(): void {
    this.templateCode = "pc_procurement";
    this.workspaceName = "电脑采购工作空间";
    this.objectTypes.splice(
      0,
      this.objectTypes.length,
      {
        id: "type-requirement",
        code: "procurement_requirement",
        name: "采购需求",
        fields: [
          fieldType("code", "编码", "text"),
          fieldType("name", "名称", "text"),
          fieldType("job_role", "岗位", "text"),
          fieldType("quantity", "采购数量", "number"),
          fieldType("unit_budget_cny", "单台预算", "number"),
          fieldType("total_budget_cny_fx", "总预算", "number", {
            computed: true,
            readOnly: true,
          }),
          fieldType("warranty_requirement", "保修要求", "text"),
          fieldType("os_requirement", "系统要求", "text"),
          fieldType("max_total_power_w", "整机最大设计功耗", "number"),
        ],
      },
      {
        id: "type-plan",
        code: "build_plan",
        name: "装机方案",
        fields: [
          fieldType("code", "编码", "text"),
          fieldType("name", "名称", "text"),
          fieldType("status", "生命周期状态", "text"),
          fieldType("body", "正文", "text"),
          fieldType("total_price_cny_fx", "方案总价", "number", {
            computed: true,
            readOnly: true,
          }),
          fieldType("total_power_w_fx", "方案总功耗", "number", {
            computed: true,
            readOnly: true,
          }),
          fieldType(
            "requirement_max_total_power_w_fx",
            "需求最大总功耗",
            "number",
            {
              computed: true,
              readOnly: true,
            },
          ),
          fieldType("total_performance_score_fx", "方案性能分", "number", {
            computed: true,
            readOnly: true,
          }),
          fieldType("requirement_budget_cny_fx", "预算", "number"),
          fieldType("power_supply_capacity_w_fx", "电源容量", "number"),
          fieldType("cpu_mainboard_platform_span_fx", "CPU平台范围", "number"),
          fieldType("memory_platform_span_fx", "内存平台范围", "number"),
        ],
      },
      {
        id: "type-plan-item",
        code: "build_plan_item",
        name: "方案明细",
        fields: [fieldType("code", "编码", "text")],
      },
      {
        id: "type-product",
        code: "hardware_product",
        name: "硬件配件",
        fields: [fieldType("code", "编码", "text")],
      },
      {
        id: "type-quote",
        code: "supplier_quote",
        name: "供应商报价",
        fields: [fieldType("code", "编码", "text")],
      },
    );
    this.relationTypes.splice(
      0,
      this.relationTypes.length,
      {
        id: "reltype-pc-satisfies",
        code: "build_plan_satisfies_requirement",
        name: "满足需求",
        hierarchical: false,
      },
      relationType("build_plan_contains_item", true),
      relationType("build_plan_item_selects_product", false),
      relationType("build_plan_item_uses_supplier_quote", false),
      relationType("supplier_quote_for_product", false),
    );
    this.objects.splice(0, this.objects.length);
    this.objects.push(
      viewObject(
        "kernel-pc-requirement",
        "procurement_requirement",
        {
          code: "REQ-DEV-A",
          name: "研发工作站采购需求",
          job_role: "前端/Java 开发",
          quantity: 20,
          unit_budget_cny: 8000,
          warranty_requirement: "三年上门",
          os_requirement: "Windows 11 Pro",
          max_total_power_w: 650,
        },
        { total_budget_cny_fx: 160000 },
      ),
      viewObject(
        "kernel-pc-valid",
        "build_plan",
        {
          code: "PLAN-STD",
          name: "标准开发配置(约8000元)",
          status: "PROPOSED",
        },
        {
          total_price_cny_fx: 8783,
          total_power_w_fx: 460,
          requirement_max_total_power_w_fx: 650,
          total_performance_score_fx: 560,
          requirement_budget_cny_fx: 10000,
          power_supply_capacity_w_fx: 750,
          cpu_mainboard_platform_span_fx: 0,
          memory_platform_span_fx: 0,
        },
      ),
      viewObject(
        "kernel-pc-invalid",
        "build_plan",
        {
          code: "PLAN-PRO",
          name: "超预算不兼容方案",
          status: "PROPOSED",
        },
        {
          total_price_cny_fx: 12872,
          total_power_w_fx: 690,
          requirement_max_total_power_w_fx: 650,
          total_performance_score_fx: 518,
          requirement_budget_cny_fx: 10000,
          power_supply_capacity_w_fx: 550,
          cpu_mainboard_platform_span_fx: 1695,
          memory_platform_span_fx: 1,
        },
      ),
      viewObject("kernel-pc-valid-cpu-item", "build_plan_item", {
        code: "ITEM-STD-CPU",
        name: "兼容方案 CPU",
        quantity: 1,
      }),
      viewObject("kernel-pc-valid-cpu-product", "hardware_product", {
        code: "HW-CPU-ULTRA7-265",
        name: "Intel Core Ultra 7 265",
        category: "CPU",
      }),
      viewObject("kernel-pc-valid-cpu-quote", "supplier_quote", {
        code: "Q-CPU-ULTRA7-265",
        name: "华北 i5 报价",
        unit_price_cny: 1699,
      }),
    );
    this.relations.splice(
      0,
      this.relations.length,
      {
        relationId: "kernel-rel-pc-valid-satisfies",
        relationType: "build_plan_satisfies_requirement",
        sourceId: "kernel-pc-valid",
        targetId: "kernel-pc-requirement",
        version: 1,
      },
      {
        relationId: "kernel-rel-pc-invalid-satisfies",
        relationType: "build_plan_satisfies_requirement",
        sourceId: "kernel-pc-invalid",
        targetId: "kernel-pc-requirement",
        version: 1,
      },
      {
        relationId: "kernel-rel-pc-valid-contains-cpu",
        relationType: "build_plan_contains_item",
        sourceId: "kernel-pc-valid",
        targetId: "kernel-pc-valid-cpu-item",
        version: 1,
      },
      {
        relationId: "kernel-rel-pc-valid-cpu-selects-product",
        relationType: "build_plan_item_selects_product",
        sourceId: "kernel-pc-valid-cpu-item",
        targetId: "kernel-pc-valid-cpu-product",
        version: 1,
      },
      {
        relationId: "kernel-rel-pc-valid-cpu-uses-quote",
        relationType: "build_plan_item_uses_supplier_quote",
        sourceId: "kernel-pc-valid-cpu-item",
        targetId: "kernel-pc-valid-cpu-quote",
        version: 1,
      },
      {
        relationId: "kernel-rel-pc-valid-cpu-quote-for-product",
        relationType: "supplier_quote_for_product",
        sourceId: "kernel-pc-valid-cpu-quote",
        targetId: "kernel-pc-valid-cpu-product",
        version: 1,
      },
    );
  }

  seedObjects(count: number): void {
    const seed = cloneDemoSeed();
    const s3 = seed.objects.find((object) => object.id === "prod-s3")!;
    const g2 = seed.objects.find((object) => object.id === "prod-g2")!;
    this.objects.push(toViewObject(s3, "kernel-prod-s3"));
    this.objects.push(toViewObject(g2, "kernel-prod-g2"));
    for (let index = 2; index < count; index += 1) {
      this.objects.push({
        objectId: `kernel-product-${index}`,
        objectType: "product_specs",
        status: "ACTIVE",
        version: 1,
        fields: { name: `Kernel Product ${index}`, price: index },
        updatedAt: "2026-07-10T10:24:00+08:00",
        source: "manual",
        ruleStatus: "OK",
      });
    }
  }

  private handleCommand(bodyText: string, init: RequestInit): Response {
    const body = JSON.parse(bodyText) as {
      readonly commandType?: string;
      readonly payload?: Record<string, unknown>;
    };
    const payload = body.payload ?? {};
    this.commands.push({
      actorId: readHeader(init.headers, "X-Actor-Id"),
      commandType: body.commandType ?? "",
      payload,
    });
    if (body.commandType === "UpdateFields") {
      if (this.failNextForbidden) {
        this.failNextForbidden = false;
        return json(
          {
            error: {
              code: "PERM-403-FIELD-DENIED",
              title: "无权限修改字段",
            },
          },
          403,
        );
      }
      if (this.failNextUpdate) {
        this.failNextUpdate = false;
        return json(
          {
            error: {
              code: "KERNEL-409-VERSION-CONFLICT",
              details: {
                currentVersion: 2,
                conflictingFields: [
                  {
                    fieldDefCode: "price",
                    yourValue: 1000,
                    currentValue: 1199,
                    changedBy: "lixiao",
                    changedAt: "2026-07-10T10:40:00+08:00",
                  },
                ],
              },
            },
          },
          409,
        );
      }
      const object = this.objects.find(
        (candidate) => candidate.objectId === payload.objectId,
      );
      if (!object) return json({ message: "missing object" }, 404);
      const fields = payload.fields as {
        readonly fieldDefCode: string;
        readonly value: unknown;
      }[];
      const next = {
        ...object,
        version: object.version + 1,
        fields: {
          ...object.fields,
          ...Object.fromEntries(
            fields.map((field) => [field.fieldDefCode, field.value]),
          ),
        },
      };
      this.objects.splice(this.objects.indexOf(object), 1, next);
      return json({ status: "COMMITTED" });
    }
    if (body.commandType === "CreateObject") {
      const fields = payload.fields as Record<string, unknown>;
      this.objectSequence += 1;
      this.objects.push({
        objectId: `created-object-${this.objectSequence}`,
        objectType: "product_specs",
        status: "ACTIVE",
        version: 1,
        fields,
        updatedAt: "2026-07-10T10:24:00+08:00",
        source: "manual",
        ruleStatus: "OK",
      });
      return json({ status: "COMMITTED" });
    }
    if (body.commandType === "CreateRelation") {
      this.relationSequence += 1;
      this.relations.push({
        relationId: `created-relation-${this.relationSequence}`,
        relationType: "interconnects_with",
        sourceId: String(payload.sourceId),
        targetId: String(payload.targetId),
        version: 1,
      });
      return json({ status: "COMMITTED" });
    }
    if (body.commandType === "Unlink") {
      return json({ status: "COMMITTED" });
    }
    if (body.commandType === "Archive") {
      const targetId = String(payload.targetId);
      const index = this.objects.findIndex(
        (object) => object.objectId === targetId,
      );
      if (index >= 0) this.objects.splice(index, 1);
      return json({ status: "COMMITTED" });
    }
    return json({ message: "unsupported command" }, 400);
  }

  private handleRuleCommand(bodyText: string, init: RequestInit): Response {
    const body = JSON.parse(bodyText) as {
      readonly commandType?: string;
      readonly payload?: Record<string, unknown>;
    };
    this.ruleCommands.push({
      actorId: readHeader(init.headers, "X-Actor-Id"),
      commandType: body.commandType ?? "",
      payload: body.payload ?? {},
    });
    return json({
      commandId: "rule-command-1",
      status: "ACCEPTED",
      events: this.ruleCommandReturnsRunId ? ["kernel-run-1"] : [],
    });
  }

  private handleAiCommand(bodyText: string, init: RequestInit): Response {
    const body = JSON.parse(bodyText) as {
      readonly commandType?: string;
      readonly payload?: Record<string, unknown>;
    };
    this.aiCommands.push({
      actorId: readHeader(init.headers, "X-Actor-Id"),
      commandType: body.commandType ?? "",
      payload: body.payload ?? {},
    });
    return json({
      status: "COMMITTED",
      events: [`event-${this.aiCommands.length}`],
      idempotentReplay: false,
    });
  }

  private handleReviewCommand(bodyText: string, init: RequestInit): Response {
    const body = JSON.parse(bodyText) as {
      readonly commandType?: string;
      readonly payload?: Record<string, unknown>;
    };
    const payload = body.payload ?? {};
    this.reviewCommands.push({
      actorId: readHeader(init.headers, "X-Actor-Id"),
      commandType: body.commandType ?? "",
      payload,
    });
    if (body.commandType === "CreateAnnotation") {
      const annotation = kernelAnnotation(
        `ann-created-${this.reviewCommands.length}`,
        String(payload.targetType),
        String(payload.targetId),
        payload.fieldCode === null ? null : String(payload.fieldCode),
        {
          severity: String(payload.severity),
          body: String(payload.body),
          anchoredDataVersion: Number(payload.anchoredDataVersion),
          createdBy: readHeader(init.headers, "X-Actor-Id") ?? "wangyun",
        },
      );
      this.annotations.push(annotation);
      return json(annotation);
    }
    if (body.commandType === "ResolveAnnotation") {
      return json(
        markAnnotation(
          this.annotations,
          String(payload.annotationId),
          true,
          readHeader(init.headers, "X-Actor-Id") ?? "wangyun",
        ),
      );
    }
    if (body.commandType === "ReopenAnnotation") {
      return json(
        markAnnotation(
          this.annotations,
          String(payload.annotationId),
          false,
          readHeader(init.headers, "X-Actor-Id") ?? "wangyun",
        ),
      );
    }
    return json({ message: "unsupported review command" }, 400);
  }
}

interface ViewObjectFixture {
  readonly objectId: string;
  readonly objectType: string;
  readonly status: string;
  readonly version: number;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly derived?: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
  readonly source: string | null;
  readonly ruleStatus: "BLOCK" | "WARN" | "OK" | "UNKNOWN";
}

interface ExpressionConfigRequestFixture {
  readonly name: string;
  readonly space: "main" | "workshop";
  readonly defaultForm: "grid" | "canvas" | "doc" | "matrix" | "bi" | "ana";
  readonly view: {
    readonly kind: "grid" | "canvas" | "doc" | "matrix" | "bi" | "ana";
    readonly config: Record<string, unknown>;
  };
}

interface ExpressionConfigFixture {
  readonly expressionId: string;
  readonly name: string;
  readonly space: "main" | "workshop";
  readonly defaultViewId: string;
  readonly defaultForm: ExpressionConfigRequestFixture["defaultForm"];
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedBy: string;
  readonly updatedAt: string;
  readonly views: readonly Record<string, unknown>[];
}

interface RelationFixture {
  readonly relationId: string;
  readonly relationType: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly version: number;
}

interface HistoryFixture {
  readonly eventId: string;
  readonly seq: number;
  readonly kind: string;
  readonly fieldCode: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly actorKind: string;
  readonly actorId: string | null;
  readonly actorDisplay: string | null;
  readonly source: string;
  readonly objectVersion: number;
  readonly correlationId: string | null;
  readonly occurredAt: string;
}

interface CheckResultFixture {
  readonly runId: string;
  readonly ruleCode: string;
  readonly severity: string;
  readonly message: string;
  readonly objectId: string;
  readonly fieldCode: string | null;
  readonly configHash: string;
  readonly createdAt: string;
}

interface AiChangeSetFixture {
  readonly setId: string;
  readonly action: string;
  readonly status: "PROPOSED" | "REJECTED" | "CONFIRMED";
  readonly provider: string;
  readonly providerVersion: string;
  readonly contextHash: string;
  readonly resultText: string | null;
  readonly createdAt: string;
  readonly applied: number;
  readonly skipped: number;
  readonly items: readonly {
    readonly itemId: string;
    readonly seq: number;
    readonly opType: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly precheck: Readonly<Record<string, unknown>>;
    readonly itemStatus: string;
  }[];
}

interface ReviewAnnotationFixture {
  readonly id: string;
  readonly workspaceId: string;
  readonly roundId: string | null;
  readonly targetType: "object" | "field" | "relation";
  readonly targetId: string;
  readonly fieldCode: string | null;
  readonly anchoredDataVersion: number;
  readonly severity: string;
  readonly body: string;
  readonly status: "open" | "resolved";
  readonly createdBy: string;
  readonly createdAt: string;
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
}

function fieldType(
  code: string,
  name: string,
  dataType: string,
  constraints: Readonly<Record<string, unknown>> = {},
) {
  return { code, name, dataType, required: false, constraints };
}

function viewObject(
  objectId: string,
  objectType: string,
  fields: Record<string, unknown>,
  derived: Record<string, unknown> = {},
): ViewObjectFixture {
  return {
    objectId,
    objectType,
    status: "ACTIVE",
    version: 1,
    fields,
    derived,
    updatedAt: "2026-07-10T10:24:00+08:00",
    source: "manual",
    ruleStatus: "OK",
  };
}

function relationType(code: string, hierarchical: boolean) {
  return {
    id: `reltype-${code}`,
    code,
    name: code,
    hierarchical,
  };
}

function toViewObject(object: DataObject, objectId: string): ViewObjectFixture {
  return {
    objectId,
    objectType: object.objectTypeCode,
    status: "ACTIVE",
    version: object.version,
    fields: Object.fromEntries(
      Object.entries(object.fields).map(([code, field]) => [code, field.value]),
    ),
    updatedAt: object.updatedAt,
    source: "manual",
    ruleStatus: "OK",
  };
}

function kernelCheck(
  ruleCode: string,
  severity: string,
  objectId: string,
  fieldCode: string | null,
): CheckResultFixture {
  return {
    runId: "kernel-run-1",
    ruleCode,
    severity,
    message: `${ruleCode} message`,
    objectId,
    fieldCode,
    configHash: "hash",
    createdAt: "2026-07-10T10:24:00+08:00",
  };
}

function kernelAiChangeSet(setId: string): AiChangeSetFixture {
  return {
    setId,
    action: "SUGGEST_FIELDS",
    status: "PROPOSED",
    provider: "kernel",
    providerVersion: "v1",
    contextHash: "hash",
    resultText: null,
    createdAt: "2026-07-10T10:24:00+08:00",
    applied: 0,
    skipped: 0,
    items: [
      {
        itemId: "ai-item-1",
        seq: 1,
        opType: "UPDATE_FIELD",
        payload: {
          objectId: "kernel-prod-s3",
          fieldCode: "price",
          before: 1299,
          after: 1199,
        },
        precheck: {},
        itemStatus: "PROPOSED",
      },
    ],
  };
}

function kernelAnnotation(
  id: string,
  targetType: string,
  targetId: string,
  fieldCode: string | null,
  overrides: Partial<ReviewAnnotationFixture> = {},
): ReviewAnnotationFixture {
  return {
    id,
    workspaceId: "ws-kernel",
    roundId: null,
    targetType: targetType as ReviewAnnotationFixture["targetType"],
    targetId,
    fieldCode,
    anchoredDataVersion: 1,
    severity: "INFO",
    body: `${id} body`,
    status: "open",
    createdBy: "wangyun",
    createdAt: "2026-07-10T10:24:00+08:00",
    resolvedBy: null,
    resolvedAt: null,
    ...overrides,
  };
}

function markAnnotation(
  annotations: ReviewAnnotationFixture[],
  annotationId: string,
  resolved: boolean,
  actor: string,
): ReviewAnnotationFixture {
  const previous =
    annotations.find((annotation) => annotation.id === annotationId) ??
    kernelAnnotation(annotationId, "object", "kernel-prod-s3", null);
  const next: ReviewAnnotationFixture = {
    ...previous,
    status: resolved ? "resolved" : "open",
    resolvedBy: resolved ? actor : null,
    resolvedAt: resolved ? "2026-07-10T10:32:00+08:00" : null,
  };
  const index = annotations.findIndex(
    (annotation) => annotation.id === annotationId,
  );
  if (index >= 0) annotations.splice(index, 1, next);
  else annotations.push(next);
  return next;
}

function exchangeDiffFixture() {
  return {
    objects: {
      added: ["prod-new"],
      removed: [],
      changed: [
        {
          objectId: "prod-s3",
          fields: {
            added: {},
            removed: {},
            changed: { price: { from: 1199, to: 1299 } },
          },
          statusChanged: null,
        },
      ],
    },
    relations: {
      added: [],
      removed: ["rel-old"],
      changed: [
        {
          relationId: "rel-s3-g2",
          fields: { added: {}, removed: {}, changed: {} },
          endpointChanged: null,
        },
      ],
    },
    summary: {
      objectsAdded: 1,
      objectsRemoved: 0,
      objectsChanged: 1,
      relationsAdded: 0,
      relationsRemoved: 1,
      relationsChanged: 1,
    },
  };
}

function lineageFixture() {
  return {
    objectId: "kernel-prod-s3",
    fieldCode: "price",
    upstream: [
      {
        kind: "field",
        objectId: "kernel-prod-g2",
        objectType: "product_specs",
        fieldCode: "cost",
        ref: null,
        source: "manual",
        updatedAt: "2026-07-10T10:24:00+08:00",
        depth: 1,
      },
    ],
    algorithm: { kind: "derived", ref: "fx.margin" },
    downstream: [
      {
        kind: "rule",
        objectId: null,
        objectType: null,
        fieldCode: null,
        ref: "R-PRICE-001",
        source: "rules",
        updatedAt: null,
        depth: 2,
      },
    ],
    partial: false,
    truncated: true,
  };
}

function outputMeta(
  outputId: string,
  snapshotId: string,
  format: string,
  actor: string,
) {
  return {
    outputId,
    dataSnapshotId: snapshotId,
    format,
    templateId: "tpl-install-v1",
    templateVersion: 1,
    reviewStatus: "READY",
    checkStatus: "OK",
    dataVersion: 7,
    createdAt: "2026-07-10T10:25:00+08:00",
    createdBy: actor,
    contentHash: "output-hash",
  };
}

function expressionConfigFixture(
  expressionId: string,
  viewId: string,
  request: ExpressionConfigRequestFixture,
  actor = "wangyun",
): ExpressionConfigFixture {
  const at = "2026-07-22T10:00:00Z";
  return {
    expressionId,
    name: request.name,
    space: request.space,
    defaultViewId: viewId,
    defaultForm: request.defaultForm,
    version: 1,
    createdBy: actor,
    createdAt: at,
    updatedBy: actor,
    updatedAt: at,
    views: [
      {
        viewId,
        expressionId,
        kind: request.view.kind,
        config: request.view.config,
        version: 1,
        createdBy: actor,
        createdAt: at,
        updatedBy: actor,
        updatedAt: at,
      },
    ],
  };
}

function readHeader(
  headers: RequestInit["headers"],
  name: string,
): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) {
    return (
      headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ??
      null
    );
  }
  return (headers as Record<string, string>)[name] ?? null;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
