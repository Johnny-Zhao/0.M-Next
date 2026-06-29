import {
  defaultFetch,
  type ExchangeDiffResult,
  type ExchangeFormat,
  type FetchFn,
  type ReviewAnnotation,
} from "./view-client";

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

export interface AiCommandResult {
  readonly events?: readonly string[];
  readonly results?: readonly unknown[];
  readonly idempotentReplay?: boolean;
}

export interface AiChangeSelection {
  readonly objectIds?: readonly string[];
  readonly checkResultIds?: readonly string[];
}

export interface ProposeAiChangeRequest {
  readonly action: "SUGGEST_FIELDS" | "EXPLAIN_CHECK";
  readonly selection?: AiChangeSelection;
  readonly instruction?: string | null;
}

export interface CreateAnnotationRequest {
  readonly targetType: "object" | "field" | "relation";
  readonly targetId: string;
  readonly fieldCode?: string | null;
  readonly anchoredDataVersion: number;
  readonly severity: string;
  readonly body: string;
  readonly roundId?: string | null;
}

export interface ExchangeApplyResult {
  readonly diff: ExchangeDiffResult;
  readonly applied: readonly string[];
  readonly unapplied: readonly {
    readonly item: string;
    readonly error: CommandError;
  }[];
}

export interface PlaceAssemblyParams {
  readonly placementKey: string;
  readonly params?: Readonly<Record<string, unknown>>;
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

async function commandFailure(
  response: Response,
  fallbackTitle: string,
): Promise<CommandFailure> {
  const body = (await response.json().catch(() => ({}))) as {
    readonly error?: Omit<CommandError, "title">;
  } & Omit<CommandError, "title">;
  const failure = body.error ?? body;
  return new CommandFailure({
    ...failure,
    title: errorTitles[failure.code] ?? fallbackTitle,
  });
}

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

  async proposeAiChange(
    workspaceId: string,
    request: ProposeAiChangeRequest,
  ): Promise<AiCommandResult> {
    return this.aiPost("ProposeAiChange", workspaceId, {
      action: request.action,
      selection: request.selection ?? { objectIds: [], checkResultIds: [] },
      instruction: request.instruction ?? null,
    });
  }

  async confirmAiChange(
    workspaceId: string,
    setId: string,
  ): Promise<AiCommandResult> {
    return this.aiPost("ConfirmAiChange", workspaceId, { setId });
  }

  async rejectAiChange(
    workspaceId: string,
    setId: string,
  ): Promise<AiCommandResult> {
    return this.aiPost("RejectAiChange", workspaceId, { setId });
  }

  async createAnnotation(
    workspaceId: string,
    request: CreateAnnotationRequest,
  ): Promise<ReviewAnnotation> {
    return this.reviewPost("CreateAnnotation", workspaceId, {
      targetType: request.targetType,
      targetId: request.targetId,
      fieldCode: request.fieldCode ?? null,
      anchoredDataVersion: request.anchoredDataVersion,
      severity: request.severity,
      body: request.body,
      roundId: request.roundId ?? null,
    });
  }

  async resolveAnnotation(
    workspaceId: string,
    annotationId: string,
    comment?: string | null,
  ): Promise<ReviewAnnotation> {
    return this.reviewPost("ResolveAnnotation", workspaceId, {
      annotationId,
      comment: comment ?? null,
    });
  }

  async reopenAnnotation(
    workspaceId: string,
    annotationId: string,
    comment?: string | null,
  ): Promise<ReviewAnnotation> {
    return this.reviewPost("ReopenAnnotation", workspaceId, {
      annotationId,
      comment: comment ?? null,
    });
  }

  async exchangeApply(
    workspaceId: string,
    format: ExchangeFormat,
    payload: string,
  ): Promise<ExchangeApplyResult> {
    if (!this.actorId) {
      throw new Error("缺少 X-Actor-Id: 请先登录后再应用导入");
    }
    let body: Readonly<Record<string, unknown>>;
    if (format === "json") {
      try {
        body = {
          artifact: JSON.parse(payload) as unknown,
          confirmRemovals: false,
        };
      } catch {
        throw new Error("JSON 制品格式不正确,请先修正后再应用");
      }
    } else {
      body = { reqif: payload, confirmRemovals: false };
    }
    const response = await this.fetchFn(
      `${this.baseUrl}/workspaces/${workspaceId}/exchange/${format}/apply`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Actor-Id": this.actorId,
        },
        body: JSON.stringify(body),
      },
    );
    if (response.ok) return response.json() as Promise<ExchangeApplyResult>;
    const failure = await commandFailure(response, "交换导入失败");
    throw failure;
  }

  async placeAssembly(
    workspaceId: string,
    assemblyId: string,
    version: number,
    request: PlaceAssemblyParams,
  ): Promise<AiCommandResult> {
    if (!this.actorId) {
      throw new Error("缺少 X-Actor-Id: 请先登录后再放置装配");
    }
    const response = await this.fetchFn(
      `${this.baseUrl}/workspaces/${workspaceId}/assembly-commands`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Actor-Id": this.actorId,
        },
        body: JSON.stringify({
          commandType: "PlaceAssembly",
          workspaceId,
          correlationId: crypto.randomUUID(),
          idempotencyKey: `pa-${crypto.randomUUID()}`,
          payload: {
            assemblyId,
            version,
            placementKey: request.placementKey,
            params: request.params ?? {},
          },
        }),
      },
    );
    if (response.ok) return response.json() as Promise<AiCommandResult>;
    const failure = await commandFailure(response, "放置装配失败");
    throw failure;
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

  private async aiPost(
    commandType: string,
    workspaceId: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<AiCommandResult> {
    if (!this.actorId) {
      throw new Error("缺少 X-Actor-Id: 请先登录后再执行 AI 命令");
    }
    const response = await this.fetchFn(
      `${this.baseUrl}/workspaces/${workspaceId}/ai-commands`,
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
          idempotencyKey: `ai-${crypto.randomUUID()}`,
          payload,
        }),
      },
    );
    if (response.ok) return response.json() as Promise<AiCommandResult>;
    const body = (await response.json()) as {
      readonly error?: Omit<CommandError, "title">;
    } & Omit<CommandError, "title">;
    const failure = body.error ?? body;
    throw new CommandFailure({
      ...failure,
      title: errorTitles[failure.code] ?? "AI 命令失败",
    });
  }

  private async reviewPost(
    commandType: string,
    workspaceId: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<ReviewAnnotation> {
    if (!this.actorId) {
      throw new Error("缺少 X-Actor-Id: 请先登录后再执行评审命令");
    }
    const response = await this.fetchFn(
      `${this.baseUrl}/workspaces/${workspaceId}/review/commands`,
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
          idempotencyKey: `rv-${crypto.randomUUID()}`,
          payload,
        }),
      },
    );
    if (response.ok) return response.json() as Promise<ReviewAnnotation>;
    const body = (await response.json()) as {
      readonly error?: Omit<CommandError, "title">;
    } & Omit<CommandError, "title">;
    const failure = body.error ?? body;
    throw new CommandFailure({
      ...failure,
      title: errorTitles[failure.code] ?? "评审命令失败",
    });
  }
}
