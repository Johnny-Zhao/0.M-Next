import type { MemberId } from "../model/kernel";
import { pushToast, type UsToastInput } from "../primitives";
import { sessionStore, type SessionStore } from "../state/session-store";
import {
  workspaceStore,
  type FieldWriteDescriptor,
  type ObjectCreateDescriptor,
  type ObjectDeleteDescriptor,
  type RelationCreateDescriptor,
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
>;

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
        await this.gateway.updateField(
          objectId,
          descriptor.fieldCode,
          descriptor.value,
          {
            ...descriptor.meta,
            actor,
            expectedObjectVersion: descriptor.expectedObjectVersion,
          },
        );
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

  createObject(descriptor: ObjectCreateDescriptor): void {
    this.enqueue([descriptor.temporaryObjectId], async () => {
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
      } catch (error) {
        this.workspace.removeObject(descriptor.temporaryObjectId);
        this.reportWriteFailure(error);
      }
    });
  }

  createRelation(descriptor: RelationCreateDescriptor): void {
    this.enqueue(
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
        } catch (error) {
          this.workspace.removeRelation(descriptor.temporaryRelationId);
          this.reportWriteFailure(error);
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

  private enqueue(keys: readonly string[], task: () => Promise<void>): void {
    const uniqueKeys = [
      ...new Set(keys.map((key) => this.resolveObjectId(key))),
    ];
    const previous = Promise.all(
      uniqueKeys.map(
        (key) => this.queueByObjectId.get(key) ?? Promise.resolve(),
      ),
    );
    const run = previous.then(task).catch(() => {
      // Each task owns rollback and toast reporting; never leak to callers.
    });
    const tracked = run.finally(() => {
      for (const key of uniqueKeys) {
        if (this.queueByObjectId.get(key) === tracked) {
          this.queueByObjectId.delete(key);
        }
      }
    });
    for (const key of uniqueKeys) this.queueByObjectId.set(key, tracked);
    this.idle = Promise.all([this.idle, tracked]).then(() => undefined);
    void tracked;
  }

  private applyActor(): MemberId {
    const actor = this.session.getSnapshot().currentMemberId;
    this.gateway.setActor(actor);
    return actor;
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
