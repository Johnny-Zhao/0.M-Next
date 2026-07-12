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

  it("keeps the write surface explicitly blocked for T-US-016", async () => {
    const api = new FakeKernelApi();
    const gateway = new KernelGateway("", "ws-kernel", "wangyun", api.fetch);

    await expect(
      gateway.updateField("kernel-prod-s3", "price", 1000, {
        actor: "wangyun",
      }),
    ).rejects.toThrow("T-US-016");
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
      return this.handleCommand(String(init.body ?? "{}"));
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

  private handleCommand(bodyText: string): Response {
    const body = JSON.parse(bodyText) as {
      readonly commandType?: string;
      readonly payload?: Record<string, unknown>;
    };
    if (body.commandType === "CreateObject") {
      const payload = body.payload ?? {};
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
      const payload = body.payload ?? {};
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

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
