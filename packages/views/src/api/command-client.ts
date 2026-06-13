import type { FetchFn } from "./view-client";

export interface FieldUpdate {
  readonly fieldDefCode: string;
  readonly value: unknown;
  readonly expectedFieldVersion: number;
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
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async updateFields(
    workspaceId: string,
    objectId: string,
    expectedObjectVersion: number,
    fields: readonly FieldUpdate[],
  ): Promise<void> {
    const response = await this.fetchFn(`${this.baseUrl}/workspaces/${workspaceId}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commandType: "UpdateFields",
        workspaceId,
        correlationId: crypto.randomUUID(),
        idempotencyKey: `ck-${crypto.randomUUID()}`,
        payload: { objectId, expectedObjectVersion, fields },
      }),
    });
    if (response.ok) return;
    const failure = (await response.json()) as Omit<CommandError, "title">;
    throw new CommandFailure({
      ...failure,
      title: errorTitles[failure.code] ?? "保存失败",
    });
  }
}
