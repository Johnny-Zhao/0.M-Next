import { defaultFetch, type FetchFn } from "./view-client";

export interface FieldUpdate {
  readonly fieldDefCode: string;
  readonly value: unknown;
  readonly expectedFieldVersion: number;
}

export interface RelationCommandResult {
  readonly relationId?: string;
  readonly version?: number;
}

export interface ConflictField {
  readonly fieldDefCode: string;
  readonly yourValue: unknown;
  readonly currentValue: unknown;
  readonly changedBy: string;
  readonly changedAt: string;
}

export interface CommandError {
  readonly code: string;
  readonly title: string;
  readonly details?: {
    readonly currentVersion?: number;
    readonly conflictingFields?: readonly ConflictField[];
  };
}

const errorTitles: Readonly<Record<string, string>> = {
  "KERNEL-409-VERSION-CONFLICT": "乐观版本冲突",
  "KERNEL-410-TARGET-ARCHIVED": "目标已废止",
  "KERNEL-423-TARGET-LOCKED": "字段或对象被他人锁定",
  "KERNEL-422-FIELD-VALUE-INVALID": "字段值不符合类型或约束",
  "PERM-403-FIELD-DENIED": "字段级权限拒绝",
};

export class CommandFailure extends Error {
  constructor(readonly commandError: CommandError) {
    super(commandError.title);
  }
}

export class CommandClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = defaultFetch,
  ) {}

  async updateFields(
    workspaceId: string,
    objectId: string,
    expectedObjectVersion: number,
    fields: readonly FieldUpdate[],
  ): Promise<void> {
    await this.post("UpdateFields", workspaceId, {
      objectId,
      expectedObjectVersion,
      fields,
    });
  }

  async createRelation(
    workspaceId: string,
    relationType: string,
    sourceId: string,
    targetId: string,
  ): Promise<RelationCommandResult | void> {
    return this.post("CreateRelation", workspaceId, {
      relationTypeId: relationType,
      sourceId,
      targetId,
      relationFields: {},
      source: { type: "manual", ref: "matrix" },
    });
  }

  async unlink(
    workspaceId: string,
    relationId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.post("Unlink", workspaceId, {
      relationId,
      reason: "matrix-cell-edit",
      expectedVersion,
      acknowledgeImpact: true,
    });
  }

  private async post<T = void>(
    commandType: string,
    workspaceId: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    const response = await this.fetchFn(
      `${this.baseUrl}/workspaces/${workspaceId}/commands`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandType,
          workspaceId,
          correlationId: crypto.randomUUID(),
          idempotencyKey: `ck-${crypto.randomUUID()}`,
          payload,
        }),
      },
    );
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return (text === "" ? undefined : JSON.parse(text)) as T;
    }
    const failure = (await response.json()) as Omit<CommandError, "title">;
    throw new CommandFailure({
      ...failure,
      title: errorTitles[failure.code] ?? "保存失败",
    });
  }
}
