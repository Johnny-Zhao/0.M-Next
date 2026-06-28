import { defaultFetch, type FetchFn } from "./view-client";

export interface FieldUpdate {
  readonly fieldDefCode: string;
  readonly value: unknown;
  // 省略/置 null = 仅按对象版本做乐观锁(字段版本与对象版本不同步,内核约定见 UpdateFieldsHandler)
  readonly expectedFieldVersion?: number | null;
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
  private actorId: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = defaultFetch,
  ) {}

  setActorId(actorId: string): void {
    const normalized = actorId.trim();
    this.actorId = normalized === "" ? null : normalized;
  }

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

  /** 用模板实例化一个新工作空间(新建项目)。新工作空间无成员=未治理,鉴权放行。 */
  async instantiateWorkspace(
    newWorkspaceId: string,
    templateId: string,
    version: number,
    workspaceName: string,
  ): Promise<void> {
    if (!this.actorId) {
      throw new Error("缺少 X-Actor-Id: 请先登录后再创建项目");
    }
    const response = await this.fetchFn(
      `${this.baseUrl}/workspaces/${newWorkspaceId}/meta-commands`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Actor-Id": this.actorId,
        },
        body: JSON.stringify({
          commandType: "InstantiateWorkspace",
          workspaceId: newWorkspaceId,
          correlationId: crypto.randomUUID(),
          idempotencyKey: `mc-${crypto.randomUUID()}`,
          payload: { templateId, version, newWorkspaceId, workspaceName },
        }),
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        readonly error?: Omit<CommandError, "title">;
      };
      const failure = body.error ?? { code: "META-COMMAND-FAILED" };
      throw new CommandFailure({
        ...failure,
        title: errorTitles[failure.code] ?? "创建项目失败",
      });
    }
  }

  private async post<T = void>(
    commandType: string,
    workspaceId: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    if (!this.actorId) {
      throw new Error("缺少 X-Actor-Id: 请先登录后再执行写命令");
    }
    const response = await this.fetchFn(
      `${this.baseUrl}/workspaces/${workspaceId}/commands`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Actor-Id": this.actorId,
        },
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
    const body = (await response.json()) as {
      readonly error?: Omit<CommandError, "title">;
    } & Omit<CommandError, "title">;
    // 后端拒绝体形如 { status, error: { code, details } };兼容直接平铺两种结构
    const failure = body.error ?? body;
    throw new CommandFailure({
      ...failure,
      title: errorTitles[failure.code] ?? "保存失败",
    });
  }
}
