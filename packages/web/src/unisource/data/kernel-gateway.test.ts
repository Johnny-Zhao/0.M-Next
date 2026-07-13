import { describe, expect, it } from "vitest";

import type { DataObject } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { KernelGateway } from "./kernel-gateway";

describe("KernelGateway", () => {
  it("loads paged objects, dedupes relations and merges history", async () => {
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
    expect(seed.changeEvents[0]?.target).toEqual({
      entityType: "field",
      entityId: "kernel-prod-s3",
      fieldCode: "price",
    });
    expect(gateway.getLastLoadReport()).toMatchObject({
      objectCount: 101,
      relationCount: 1,
      historyCount: 1,
    });
    expect(api.objectPageCalls).toEqual([0, 1]);
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

    const runId = await gateway.runRuleCheck();

    expect(runId).toBe("kernel-run-1");
    expect(api.ruleCommands[0]).toMatchObject({
      actorId: "lixiao",
      commandType: "RunRuleCheck",
      payload: {},
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
});

class FakeKernelApi {
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
  readonly objectPageCalls: number[] = [];
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
  readonly checkResultPageCalls: number[] = [];
  failNextUpdate = false;
  failNextSnapshot = false;
  ruleCommandReturnsRunId = true;
  private objectSequence = 0;
  private relationSequence = 0;

  readonly fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/views/object-types")) {
      return json(this.objectTypes);
    }
    if (url.pathname.endsWith("/views/relation-types")) {
      return json(this.relationTypes);
    }
    if (url.pathname.endsWith("/views/objects")) {
      const page = Number(url.searchParams.get("page") ?? "0");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "100");
      this.objectPageCalls.push(page);
      const items = this.objects.slice(page * pageSize, (page + 1) * pageSize);
      return json({ items, page, pageSize, total: this.objects.length });
    }
    const objectDetail = url.pathname.match(/\/views\/objects\/([^/]+)$/);
    if (objectDetail) {
      const objectId = objectDetail[1] ?? "";
      return json({
        object: this.objects.find((object) => object.objectId === objectId),
        relations: this.relations.filter(
          (relation) =>
            relation.sourceId === objectId || relation.targetId === objectId,
        ),
      });
    }
    const history = url.pathname.match(/\/views\/objects\/([^/]+)\/history$/);
    if (history) {
      const objectId = history[1] ?? "";
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
    if (url.pathname.endsWith("/commands") && init?.method === "POST") {
      return this.handleCommand(String(init.body ?? "{}"), init);
    }
    return json({ message: "not found" }, 404);
  };

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
  readonly updatedAt: string;
  readonly source: string | null;
  readonly ruleStatus: "BLOCK" | "WARN" | "OK" | "UNKNOWN";
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
