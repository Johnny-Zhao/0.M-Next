import { afterEach, describe, expect, it } from "vitest";

import type {
  DataFieldPrimitive,
  DataObject,
  DataRelation,
  FieldCode,
  MemberId,
} from "../model/kernel";
import { getToasts, resetToastsForTest } from "../primitives/toast/toast-store";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "../state/changeset-store";
import { SessionStore } from "../state/session-store";
import { WorkspaceStore } from "../state/workspace-store";
import type { UnisourceGateway, WriteRejection } from "./gateway";
import { KernelWriteBridge } from "./write-bridge";

describe("KernelWriteBridge", () => {
  afterEach(() => {
    resetToastsForTest();
  });

  it("dispatches updateField with the current actor and object version", async () => {
    const harness = createHarness();
    harness.session.switchMember("lixiao");
    harness.workspace.setWriteSink(harness.bridge);

    harness.workspace.updateField("prod-s3", "price", 1099, {
      actor: "wangyun",
    });
    await harness.bridge.whenIdle();

    expect(harness.gateway.actors).toEqual(["lixiao"]);
    expect(harness.gateway.updateFieldCalls[0]).toMatchObject({
      objectId: "prod-s3",
      fieldCode: "price",
      value: 1099,
      expectedObjectVersion: 1,
      actor: "lixiao",
    });
  });

  it("rolls back local fields and shows a toast when the kernel rejects", async () => {
    const rejection: WriteRejection = {
      code: "KERNEL-409-VERSION-CONFLICT",
      title: "乐观版本冲突",
      currentVersion: 3,
      conflictingFields: [
        {
          fieldCode: "price",
          currentValue: 1199,
          changedBy: "lixiao",
          changedAt: "2026-07-10T10:40:00+08:00",
        },
      ],
    };
    const harness = createHarness({ updateFieldError: rejection });
    harness.workspace.setWriteSink(harness.bridge);

    harness.workspace.updateField("prod-s3", "price", 1099, {
      actor: "wangyun",
    });
    await harness.bridge.whenIdle();

    expect(harness.workspace.getObject("prod-s3")?.fields.price?.value).toBe(
      1199,
    );
    expect(getToasts()[0]).toMatchObject({
      title: "乐观版本冲突",
      desc: expect.stringContaining("price: 当前 1199"),
    });
  });

  it("replaces the optimistic object with the authoritative field projection", async () => {
    const seed = cloneDemoSeed();
    const before = seed.objects.find((object) => object.id === "prod-s3")!;
    const authoritative: DataObject = {
      ...before,
      version: 8,
      fields: {
        ...before.fields,
        price: { ...before.fields.price!, value: 1099 },
        read_model_fx: { ...before.fields.price!, value: 2198 },
      },
    };
    const harness = createHarness({ updateFieldObject: authoritative });
    harness.workspace.setWriteSink(harness.bridge);

    harness.workspace.updateField("prod-s3", "price", 1099, {
      actor: "wangyun",
    });
    await harness.bridge.whenIdle();

    expect(harness.workspace.getObject("prod-s3")).toMatchObject({
      version: 8,
      fields: { price: { value: 1099 }, read_model_fx: { value: 2198 } },
    });
  });

  it("refreshes loaded direct neighbors after a successful field write", async () => {
    const seed = cloneDemoSeed();
    const gatewayObject = seed.objects.find(
      (object) => object.id === "prod-g2",
    )!;
    const harness = createHarness({
      refreshedObjects: {
        "prod-g2": {
          ...gatewayObject,
          fields: {
            ...gatewayObject.fields,
            refreshed_fx: { ...gatewayObject.fields.name!, value: 42 },
          },
        },
      },
    });
    harness.workspace.setWriteSink(harness.bridge);

    harness.workspace.updateField("prod-s3", "price", 1099, {
      actor: "wangyun",
    });
    await harness.bridge.whenIdle();

    expect(harness.gateway.refreshObjectCalls).toContain("prod-g2");
    expect(
      harness.workspace.getObject("prod-g2")?.fields.refreshed_fx?.value,
    ).toBe(42);
  });

  it("reconciles temporary object ids after createObject succeeds", async () => {
    const harness = createHarness();
    harness.workspace.setWriteSink(harness.bridge);

    const local = harness.workspace.createObject({
      objectTypeCode: "contracts",
      fields: { name: "桥接合同" },
      objectId: "obj-local-contract",
      actor: "wangyun",
    });
    await harness.bridge.whenIdle();

    expect(harness.gateway.createObjectCalls[0]).toMatchObject({
      objectTypeCode: "contracts",
      fields: { name: "桥接合同" },
    });
    expect(harness.workspace.getObject(local.id)).toBeUndefined();
    expect(
      harness.workspace.getObject("kernel-obj-local-contract"),
    ).toBeDefined();
  });

  it("reconciles temporary relation ids after createRelation succeeds", async () => {
    const harness = createHarness();
    harness.workspace.setWriteSink(harness.bridge);

    const local = harness.workspace.createRelation({
      relationTypeCode: "interconnects_with",
      sourceId: "prod-s3",
      targetId: "prod-m1",
      actor: "wangyun",
    }).relation;
    await harness.bridge.whenIdle();

    expect(
      harness.workspace.getRelations().some((r) => r.id === local.id),
    ).toBe(false);
    expect(
      harness.workspace
        .getRelations()
        .some((relation) => relation.id === "kernel-relation"),
    ).toBe(true);
  });

  it("refreshes only the relation endpoints after a relation write", async () => {
    const harness = createHarness();
    harness.workspace.setWriteSink(harness.bridge);

    harness.workspace.createRelation({
      relationTypeCode: "interconnects_with",
      sourceId: "prod-s3",
      targetId: "prod-m1",
      actor: "wangyun",
    });
    await harness.bridge.whenIdle();

    expect(harness.gateway.refreshObjectCalls).toEqual(["prod-s3", "prod-m1"]);
  });

  it("serializes writes for the same object id", async () => {
    const first = deferred<void>();
    const firstStarted = deferred<void>();
    const harness = createHarness({
      firstUpdateGate: first.promise,
      onUpdateCall: () => firstStarted.resolve(),
    });
    harness.workspace.setWriteSink(harness.bridge);

    harness.workspace.updateField("prod-s3", "price", 1099, {
      actor: "wangyun",
    });
    harness.workspace.updateField("prod-s3", "battery_months", 14, {
      actor: "wangyun",
    });
    await firstStarted.promise;

    expect(harness.gateway.updateFieldCalls).toHaveLength(1);
    first.resolve();
    await harness.bridge.whenIdle();

    expect(
      harness.gateway.updateFieldCalls.map((call) => call.fieldCode),
    ).toEqual(["price", "battery_months"]);
  });
});

function createHarness(options: FakeGatewayOptions = {}): {
  readonly seed: DemoSeed;
  readonly workspace: WorkspaceStore;
  readonly session: SessionStore;
  readonly gateway: FakeGateway;
  readonly bridge: KernelWriteBridge;
} {
  const seed = cloneDemoSeed();
  const workspace = new WorkspaceStore(seed);
  const changeSets = new ChangeSetStore(seed, workspace);
  const session = new SessionStore(workspace, changeSets);
  const gateway = new FakeGateway(seed, options);
  const bridge = new KernelWriteBridge(gateway, {
    workspace,
    session,
  });
  return { seed, workspace, session, gateway, bridge };
}

interface FakeGatewayOptions {
  readonly updateFieldError?: WriteRejection;
  readonly updateFieldObject?: DataObject;
  readonly refreshedObjects?: Readonly<Record<string, DataObject>>;
  readonly firstUpdateGate?: Promise<void>;
  readonly onUpdateCall?: () => void;
}

class FakeGateway
  implements
    Pick<
      UnisourceGateway,
      | "setActor"
      | "updateField"
      | "createObject"
      | "createRelation"
      | "deleteObject"
    >
{
  readonly actors: MemberId[] = [];
  readonly refreshObjectCalls: string[] = [];
  readonly updateFieldCalls: {
    readonly objectId: string;
    readonly fieldCode: FieldCode;
    readonly value: DataFieldPrimitive;
    readonly expectedObjectVersion: number | undefined;
    readonly actor: MemberId;
  }[] = [];
  readonly createObjectCalls: Parameters<
    UnisourceGateway["createObject"]
  >[0][] = [];
  private actor: MemberId = "wangyun";

  constructor(
    private readonly seed: DemoSeed,
    private readonly options: FakeGatewayOptions,
  ) {}

  setActor(actorId: MemberId): void {
    this.actor = actorId;
    this.actors.push(actorId);
  }

  async updateField(
    objectId: string,
    fieldCode: FieldCode,
    value: DataFieldPrimitive,
    meta: Parameters<UnisourceGateway["updateField"]>[3],
  ) {
    this.updateFieldCalls.push({
      objectId,
      fieldCode,
      value,
      expectedObjectVersion: meta.expectedObjectVersion,
      actor: meta.actor,
    });
    this.options.onUpdateCall?.();
    if (this.updateFieldCalls.length === 1 && this.options.firstUpdateGate) {
      await this.options.firstUpdateGate;
    }
    if (this.options.updateFieldError) throw this.options.updateFieldError;
    return {
      event: {
        id: "kernel-event",
        track: "data" as const,
        actor: this.actor,
        target: { entityType: "field" as const, entityId: objectId, fieldCode },
        syncedRefs: 0,
        at: "2026-07-10T10:24:00+08:00",
        inverse: null,
      },
      syncedRefs: 0,
      object:
        this.options.updateFieldObject ??
        this.seed.objects.find((object) => object.id === objectId)!,
    };
  }

  async refreshObject(objectId: string): Promise<DataObject> {
    this.refreshObjectCalls.push(objectId);
    return (
      this.options.refreshedObjects?.[objectId] ??
      this.seed.objects.find((object) => object.id === objectId)!
    );
  }

  async createObject(
    params: Parameters<UnisourceGateway["createObject"]>[0],
  ): Promise<DataObject> {
    this.createObjectCalls.push(params);
    return {
      id: `kernel-${params.objectId ?? "obj-local-contract"}`,
      objectTypeCode: params.objectTypeCode,
      status: "active",
      version: 1,
      fields: Object.fromEntries(
        Object.entries(params.fields).map(([code, value]) => [
          code,
          {
            value,
            fieldVersion: 1,
            updatedBy: this.actor,
            updatedAt: "2026-07-10T10:24:00+08:00",
            source: "manual" as const,
          },
        ]),
      ),
      createdBy: this.actor,
      createdAt: "2026-07-10T10:24:00+08:00",
      updatedBy: this.actor,
      updatedAt: "2026-07-10T10:24:00+08:00",
    };
  }

  async createRelation(
    params: Parameters<UnisourceGateway["createRelation"]>[0],
  ): Promise<{ readonly relation: DataRelation }> {
    return {
      relation: {
        id: "kernel-relation",
        relationTypeCode: params.relationTypeCode,
        sourceId: params.sourceId,
        targetId: params.targetId,
        status: "active",
        fields: {},
        version: 1,
        annotationIds: [],
      },
    };
  }

  async deleteObject(
    objectId: string,
    actor?: MemberId,
    expectedVersion?: number,
  ): Promise<DataObject> {
    void actor;
    void expectedVersion;
    return this.seed.objects.find((object) => object.id === objectId)!;
  }
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value?: T | PromiseLike<T>) => void;
} {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve as (value?: T | PromiseLike<T>) => void;
  });
  return { promise, resolve };
}
