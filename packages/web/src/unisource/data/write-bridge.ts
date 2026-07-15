import type { DataObject, MemberId } from "../model/kernel";
import { pushToast, type UsToastInput } from "../primitives";
import { sessionStore, type SessionStore } from "../state/session-store";
import {
  workspaceStore,
  type FieldWriteDescriptor,
  type ObjectCreateDescriptor,
  type ObjectDeleteDescriptor,
  type RelationCreateDescriptor,
  type WriteCompletion,
  type WorkspaceStore,
  type WriteSink,
} from "../state/workspace-store";
import type { UnisourceGateway, WriteRejection } from "./gateway";

type WriteGateway = Pick<
  UnisourceGateway,
  | "setActor"
  | "updateField"
  | "createObject"
  | "createRelation"
  | "deleteObject"
> & {
  refreshObject?(objectId: string): Promise<DataObject>;
};

export interface KernelWriteBridgeOptions {
  readonly workspace?: WorkspaceStore;
  readonly session?: SessionStore;
  readonly pushToast?: (input: UsToastInput) => number;
}

export class KernelWriteBridge implements WriteSink {
  private readonly workspace: WorkspaceStore;
  private readonly session: SessionStore;
  private readonly showToast: (input: UsToastInput) => number;
  private readonly queueByObjectId = new Map<string, Promise<void>>();
  private readonly objectIdMap = new Map<string, string>();
  private idle: Promise<void> = Promise.resolve();

  constructor(
    private readonly gateway: WriteGateway,
    options: KernelWriteBridgeOptions = {},
  ) {
    this.workspace = options.workspace ?? workspaceStore;
    this.session = options.session ?? sessionStore;
    this.showToast = options.pushToast ?? pushToast;
  }

  updateField(descriptor: FieldWriteDescriptor): void {
    this.enqueue([descriptor.objectId], async () => {
      try {
        const actor = this.applyActor();
        const objectId = this.resolveObjectId(descriptor.objectId);
        const result = await this.gateway.updateField(
          objectId,
          descriptor.fieldCode,
          descriptor.value,
          {
            ...descriptor.meta,
            actor,
            expectedObjectVersion: descriptor.expectedObjectVersion,
          },
        );
        this.workspace.reconcileObject(result.object);
        await this.refreshRelatedObjects(objectId);
      } catch (error) {
        const objectId = this.resolveObjectId(descriptor.objectId);
        this.workspace.rollbackField({
          objectId,
          previousObject: descriptor.previousObject,
        });
        this.reportWriteFailure(error);
      }
    });
  }

  createObject(descriptor: ObjectCreateDescriptor): Promise<WriteCompletion> {
    return this.enqueue([descriptor.temporaryObjectId], async () => {
      try {
        const actor = this.applyActor();
        const object = await this.gateway.createObject({
          objectTypeCode: descriptor.params.objectTypeCode,
          fields: descriptor.params.fields,
          actor,
          source: descriptor.params.source,
          summary: descriptor.params.summary,
        });
        this.objectIdMap.set(descriptor.temporaryObjectId, object.id);
        this.workspace.reconcileObjectId(descriptor.temporaryObjectId, object);
        return { state: "synced", objectId: object.id };
      } catch (error) {
        this.workspace.removeObject(descriptor.temporaryObjectId);
        this.reportWriteFailure(error);
        return writeFailure(error);
      }
    });
  }

  createRelation(
    descriptor: RelationCreateDescriptor,
  ): Promise<WriteCompletion> {
    return this.enqueue(
      [
        descriptor.params.sourceId,
        descriptor.params.targetId,
        descriptor.temporaryRelationId,
      ],
      async () => {
        try {
          const actor = this.applyActor();
          const result = await this.gateway.createRelation({
            relationTypeCode: descriptor.params.relationTypeCode,
            sourceId: this.resolveObjectId(descriptor.params.sourceId),
            targetId: this.resolveObjectId(descriptor.params.targetId),
            fields: descriptor.params.fields,
            actor,
            summary: descriptor.params.summary,
          });
          this.workspace.reconcileRelationId(
            descriptor.temporaryRelationId,
            result.relation,
          );
          await this.refreshObjects([
            descriptor.params.sourceId,
            descriptor.params.targetId,
          ]);
          return { state: "synced", relationId: result.relation.id };
        } catch (error) {
          this.workspace.removeRelation(descriptor.temporaryRelationId);
          this.reportWriteFailure(error);
          return writeFailure(error);
        }
      },
    );
  }

  deleteObject(descriptor: ObjectDeleteDescriptor): void {
    this.enqueue([descriptor.objectId], async () => {
      const objectId = this.resolveObjectId(descriptor.objectId);
      try {
        const actor = this.applyActor();
        await this.gateway.deleteObject(
          objectId,
          actor,
          descriptor.expectedVersion,
        );
      } catch (error) {
        this.workspace.restoreObject(descriptor.snapshot, objectId);
        this.reportWriteFailure(error);
      }
    });
  }

  whenIdle(): Promise<void> {
    return this.idle;
  }

  async refreshObjects(objectIds: readonly string[]): Promise<WriteCompletion> {
    if (!this.gateway.refreshObject) return { state: "synced" };
    try {
      await Promise.all(
        [
          ...new Set(
            objectIds.map((objectId) => this.resolveObjectId(objectId)),
          ),
        ].map(async (objectId) =>
          this.workspace.reconcileObject(
            await this.gateway.refreshObject!(objectId),
          ),
        ),
      );
      return { state: "synced" };
    } catch (error) {
      this.reportWriteFailure(error);
      return {
        state: "failed",
        message: "派生字段同步失败，请重新加载工作空间",
      };
    }
  }

  private enqueue(
    keys: readonly string[],
    task: () => Promise<WriteCompletion | void>,
  ): Promise<WriteCompletion> {
    const uniqueKeys = [
      ...new Set(keys.map((key) => this.resolveObjectId(key))),
    ];
    const previous = Promise.all(
      uniqueKeys.map(
        (key) => this.queueByObjectId.get(key) ?? Promise.resolve(),
      ),
    );
    const run = previous
      .then(task)
      .then((completion) => completion ?? { state: "synced" as const })
      .catch((error) => {
        this.reportWriteFailure(error);
        return writeFailure(error);
      });
    const tracked = run
      .then(() => undefined)
      .finally(() => {
        for (const key of uniqueKeys) {
          if (this.queueByObjectId.get(key) === tracked) {
            this.queueByObjectId.delete(key);
          }
        }
      });
    for (const key of uniqueKeys) this.queueByObjectId.set(key, tracked);
    this.idle = Promise.all([this.idle, tracked]).then(() => undefined);
    void tracked;
    return run;
  }

  private applyActor(): MemberId {
    const actor = this.session.getSnapshot().currentMemberId;
    this.gateway.setActor(actor);
    return actor;
  }

  private async refreshRelatedObjects(objectId: string): Promise<void> {
    if (!this.gateway.refreshObject) return;
    const relatedIds = new Set(
      this.workspace
        .getRelations(objectId)
        .map((relation) =>
          relation.sourceId === objectId
            ? relation.targetId
            : relation.sourceId,
        ),
    );
    await Promise.all(
      [...relatedIds].map(async (relatedId) => {
        try {
          this.workspace.reconcileObject(
            await this.gateway.refreshObject!(relatedId),
          );
        } catch {
          // The saved object remains authoritative even if an adjacent read model lags.
        }
      }),
    );
  }

  private resolveObjectId(objectId: string): string {
    let current = objectId;
    const seen = new Set<string>();
    while (this.objectIdMap.has(current) && !seen.has(current)) {
      seen.add(current);
      current = this.objectIdMap.get(current) ?? current;
    }
    return current;
  }

  private reportWriteFailure(error: unknown): void {
    const rejection = toWriteRejection(error);
    this.showToast({
      title: rejection.title,
      desc: rejectionDescription(rejection),
      durationMs: 8000,
    });
  }
}

function toWriteRejection(error: unknown): WriteRejection {
  if (isWriteRejection(error)) return error;
  return {
    code: "KERNEL-WRITE-FAILED",
    title: "内核写入失败",
    conflictingFields: [],
  };
}

function writeFailure(error: unknown): WriteCompletion {
  return { state: "failed", message: toWriteRejection(error).title };
}

function isWriteRejection(value: unknown): value is WriteRejection {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" &&
    typeof record.title === "string" &&
    Array.isArray(record.conflictingFields)
  );
}

function rejectionDescription(rejection: WriteRejection): string {
  if (rejection.conflictingFields.length === 0) return rejection.code;
  return rejection.conflictingFields
    .map(
      (field) =>
        `${field.fieldCode}: 当前 ${String(field.currentValue)} · ${field.changedBy} · ${field.changedAt}`,
    )
    .join("\n");
}
