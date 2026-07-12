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
  failNextUpdate = false;
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
