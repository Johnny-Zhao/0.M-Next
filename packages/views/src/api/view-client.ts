export interface FieldDefinition {
  readonly code: string;
  readonly name: string;
  readonly dataType: string;
  readonly required: boolean;
  readonly constraints: Readonly<Record<string, unknown>>;
}

export interface ObjectType {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly fields: readonly FieldDefinition[];
}

export type RuleStatus = "BLOCK" | "WARN" | "OK" | "UNKNOWN";

export interface ViewObject {
  readonly objectId: string;
  readonly objectType: string;
  readonly status: string;
  readonly version: number;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly derived?: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
  readonly source: string | null;
  readonly ruleStatus: RuleStatus;
}

export interface RuleStatusItem {
  readonly objectId: string;
  readonly ruleStatus: RuleStatus;
}

export interface RelationSummary {
  readonly relationId: string;
  readonly relationType: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly version: number;
}

export interface TreeNodeSummary {
  readonly sourceId: string;
  readonly targetId: string;
  readonly depth: number;
}

export interface ObjectPage {
  readonly items: readonly ViewObject[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ObjectDetail {
  readonly object: ViewObject;
  readonly relations: readonly RelationSummary[];
}

export interface SyncStatus {
  readonly pendingEvents: number;
  readonly caughtUp: boolean;
}

export interface SnapshotMeta {
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly dataVersion: number;
  readonly contentHash: string;
  readonly scopeObjectType: string | null;
}

export interface SnapshotPage {
  readonly items: readonly SnapshotMeta[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface SnapshotDataObject {
  readonly objectId: string;
  readonly objectTypeCode: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly status: string;
  readonly version: number;
}

export interface SnapshotDataRelation {
  readonly relationId: string;
  readonly relationTypeCode: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface SnapshotDataSet {
  readonly objects: readonly SnapshotDataObject[];
  readonly relations: readonly SnapshotDataRelation[];
}

export interface SnapshotDetail {
  readonly meta: SnapshotMeta;
  readonly payload: SnapshotDataSet;
}

export interface DiffRequest {
  readonly a?: SnapshotDataSet;
  readonly b?: SnapshotDataSet;
  readonly base?: string | null;
  readonly other?: SnapshotDataSet;
}

export type OutputFormat =
  | "markdown"
  | "docx"
  | "pdf"
  | "html"
  | "csv"
  | "xlsx";

export interface OutputCreateRequest {
  readonly snapshotId: string;
  readonly format: OutputFormat;
  readonly templateId?: string | null;
  readonly templateVersion?: number | null;
  readonly objectType?: string | null;
  readonly fieldOrder?: readonly string[] | null;
}

export interface OutputMeta {
  readonly outputId: string;
  readonly dataSnapshotId: string;
  readonly format: OutputFormat;
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  readonly reviewStatus: string;
  readonly checkStatus: string;
  readonly dataVersion: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly contentHash: string;
}

export interface OutputDetail {
  readonly meta: OutputMeta;
  readonly artifact: string;
}

export interface OutputPage {
  readonly items: readonly OutputMeta[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface MatrixObject {
  readonly objectId: string;
  readonly label: string;
  readonly status: string;
}

export interface MatrixCell {
  readonly rowId: string;
  readonly colId: string;
  readonly relationId: string;
  readonly status: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface MatrixResult {
  readonly rows: readonly MatrixObject[];
  readonly cols: readonly MatrixObject[];
  readonly cells: readonly MatrixCell[];
  readonly rowTotal: number;
  readonly colTotal: number;
}

export interface LineageNode {
  readonly kind: "field" | "derived" | "rule" | "recommendation";
  readonly objectId: string | null;
  readonly objectType: string | null;
  readonly fieldCode: string | null;
  readonly ref: string | null;
  readonly source: string | null;
  readonly updatedAt: string | null;
  readonly depth: number;
}

export interface LineageView {
  readonly objectId: string;
  readonly fieldCode: string;
  readonly upstream: readonly LineageNode[];
  readonly algorithm: {
    readonly kind: "stored" | "derived" | "rule";
    readonly ref: string;
  };
  readonly downstream: readonly LineageNode[];
  readonly partial: boolean;
  readonly truncated: boolean;
}

export interface CheckResultItem {
  readonly runId: string;
  readonly ruleCode: string;
  readonly severity: string;
  readonly message: string;
  readonly objectId: string;
  readonly fieldCode: string | null;
  readonly configHash: string;
  readonly createdAt: string;
}

export interface CheckResultPage {
  readonly items: readonly CheckResultItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface MappingFieldMapping {
  readonly targetFieldCode: string;
  readonly expression: string;
}

export interface MappingCorrespondence {
  readonly correspondenceId: string;
  readonly relationType: string;
  readonly relationTypeId: string | null;
  readonly sourceProfile: string;
  readonly targetProfile: string;
  readonly sourceTypeCode: string;
  readonly sourceTypeName: string;
  readonly targetTypeCode: string;
  readonly targetTypeName: string;
  readonly cardinality: string;
  readonly direction: "source_to_target" | "target_to_source" | "bidirectional";
  readonly fieldMappings: readonly MappingFieldMapping[];
}

export type MappingCoverageStatus = "mapped" | "unmapped" | "stale";

export interface MappingCoverageItem {
  readonly sourceObjectId: string;
  readonly sourceLabel: string;
  readonly sourceVersion: number;
  readonly targetObjectId: string | null;
  readonly targetLabel: string | null;
  readonly targetVersion: number | null;
  readonly relationId: string | null;
  readonly anchoredSourceVersion: number | null;
  readonly status: MappingCoverageStatus;
  readonly updatedAt: string | null;
}

export interface MappingCoveragePage {
  readonly items: readonly MappingCoverageItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface TemplateTypeOverview {
  readonly code: string;
  readonly name: string;
}

export interface TemplateCatalogItem {
  readonly templateId: string;
  readonly code: string;
  readonly name: string;
  readonly version: number;
  readonly latestPublishedVersion: number;
  readonly publishedAt: string | null;
  readonly description: string | null;
  readonly typeOverview: readonly TemplateTypeOverview[];
  readonly typeOverviewTruncated: boolean;
}

export interface ReusableAssembly {
  readonly assemblyId: string;
  readonly name: string;
  readonly templateVersionId: string;
  readonly templateCode: string;
  readonly templateVersion: number;
  readonly version: number;
  readonly params: Readonly<Record<string, unknown>>;
  readonly objectTypes: readonly string[];
  readonly createdAt: string;
}

export interface ReusableAssemblyPage {
  readonly items: readonly ReusableAssembly[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface MappingField {
  readonly targetFieldCode: string;
  readonly expression: string;
}

export interface MappingObject {
  readonly sourceTypeCode: string;
  readonly targetTypeCode: string;
  readonly cardinality: string | null;
  readonly direction: string | null;
  readonly fieldMappings: readonly MappingField[];
}

export interface MappingRelation {
  readonly sourceRelationCode: string;
  readonly targetRelationCode: string;
}

export interface MappingProfile {
  readonly code: string;
  readonly name: string;
  readonly correspondenceRelationCode: string;
  readonly sourceProfile: string | null;
  readonly targetProfile: string | null;
  readonly sourceTypeCode: string;
  readonly targetTypeCode: string;
  readonly objectMappings: readonly MappingObject[];
  readonly relationMappings: readonly MappingRelation[];
}

export interface WorkspaceSummary {
  readonly workspaceId: string;
  readonly name: string;
  readonly templateCode: string | null;
  readonly updatedAt: string;
}

export interface AiChangeSet {
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
  readonly items: readonly AiChangeItem[];
}

export interface AiChangeItem {
  readonly itemId: string;
  readonly seq: number;
  readonly opType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly precheck: Readonly<Record<string, unknown>>;
  readonly itemStatus: string;
}

export interface ReviewAnnotation {
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

export type ExchangeFormat = "json" | "reqif";

export interface ExchangeValueChange {
  readonly from: unknown;
  readonly to: unknown;
}

export interface ExchangeFieldDiff {
  readonly added: Readonly<Record<string, unknown>>;
  readonly removed: Readonly<Record<string, unknown>>;
  readonly changed: Readonly<Record<string, ExchangeValueChange>>;
}

export interface ExchangeChangedObject {
  readonly objectId: string;
  readonly fields: ExchangeFieldDiff;
  readonly statusChanged: ExchangeValueChange | null;
}

export interface ExchangeChangedRelation {
  readonly relationId: string;
  readonly fields: ExchangeFieldDiff;
  readonly endpointChanged: {
    readonly fromSource: string;
    readonly fromTarget: string;
    readonly toSource: string;
    readonly toTarget: string;
  } | null;
}

export interface ExchangeDiffResult {
  readonly objects: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly ExchangeChangedObject[];
  };
  readonly relations: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly ExchangeChangedRelation[];
  };
  readonly summary: {
    readonly objectsAdded: number;
    readonly objectsRemoved: number;
    readonly objectsChanged: number;
    readonly relationsAdded: number;
    readonly relationsRemoved: number;
    readonly relationsChanged: number;
  };
}

export interface ExchangeExportResult {
  readonly format: ExchangeFormat;
  readonly payload: string;
  readonly contentType: string;
}

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export const defaultFetch: FetchFn = (input, init) => fetch(input, init);

export class ViewClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = defaultFetch,
  ) {}

  captureSnapshot(
    workspaceId: string,
    actorId: string,
    scopeObjectType?: string | null,
  ): Promise<SnapshotMeta> {
    return this.post(`/workspaces/${workspaceId}/snapshots`, actorId, {
      scopeObjectType: scopeObjectType || null,
    });
  }

  listSnapshots(
    workspaceId: string,
    actorId: string,
    page = 0,
    size = 50,
  ): Promise<SnapshotPage> {
    if (page < 0 || size < 1 || size > 50)
      throw new Error(
        "snapshot page must be non-negative and size must be 1..50",
      );
    const query = new URLSearchParams({ page: `${page}`, size: `${size}` });
    return this.getWithActor(
      `/workspaces/${workspaceId}/snapshots?${query}`,
      actorId,
    );
  }

  getSnapshot(
    workspaceId: string,
    actorId: string,
    snapshotId: string,
  ): Promise<SnapshotDetail> {
    return this.getWithActor(
      `/workspaces/${workspaceId}/snapshots/${snapshotId}`,
      actorId,
    );
  }

  diff(workspaceId: string, request: DiffRequest): Promise<ExchangeDiffResult> {
    return this.postWithoutActor(`/workspaces/${workspaceId}/diff`, request);
  }

  createOutput(
    workspaceId: string,
    actorId: string,
    request: OutputCreateRequest,
  ): Promise<OutputMeta> {
    return this.post(`/workspaces/${workspaceId}/outputs`, actorId, request);
  }

  getOutput(workspaceId: string, outputId: string): Promise<OutputDetail> {
    return this.get(`/workspaces/${workspaceId}/outputs/${outputId}`);
  }

  listOutputs(workspaceId: string, page = 0, size = 50): Promise<OutputPage> {
    if (page < 0 || size < 1 || size > 50)
      throw new Error(
        "output page must be non-negative and size must be 1..50",
      );
    const query = new URLSearchParams({ page: `${page}`, size: `${size}` });
    return this.get(`/workspaces/${workspaceId}/outputs?${query}`);
  }

  objectTypes(workspaceId: string): Promise<readonly ObjectType[]> {
    return this.get(`/workspaces/${workspaceId}/views/object-types`);
  }

  templates(): Promise<readonly TemplateCatalogItem[]> {
    return this.get("/views/templates");
  }

  workspaces(): Promise<readonly WorkspaceSummary[]> {
    return this.get("/views/workspaces");
  }

  mappingProfiles(workspaceId: string): Promise<readonly MappingProfile[]> {
    return this.get(`/workspaces/${workspaceId}/views/mapping-profiles`);
  }

  reusableAssemblies(
    workspaceId: string,
    profile?: string | null,
    page = 0,
    size = 100,
  ): Promise<ReusableAssemblyPage> {
    if (page < 0 || size < 1 || size > 100) {
      throw new Error(
        "assembly page must be non-negative and size must be 1..100",
      );
    }
    const query = new URLSearchParams({ page: `${page}`, size: `${size}` });
    if (profile) query.set("profile", profile);
    return this.get(
      `/workspaces/${workspaceId}/views/reusable-assemblies?${query}`,
    );
  }

  aiChanges(
    workspaceId: string,
    actorId: string,
    filters: { readonly status?: string; readonly setId?: string } = {},
  ): Promise<readonly AiChangeSet[]> {
    const query = new URLSearchParams();
    if (filters.status) query.set("status", filters.status);
    if (filters.setId) query.set("setId", filters.setId);
    const suffix = query.size > 0 ? `?${query}` : "";
    return this.getWithActor(
      `/workspaces/${workspaceId}/views/ai-changes${suffix}`,
      actorId,
    );
  }

  annotations(
    workspaceId: string,
    targetType: "object" | "field" | "relation",
    targetId: string,
    fieldCode?: string | null,
  ): Promise<readonly ReviewAnnotation[]> {
    const query = new URLSearchParams({ targetType, targetId });
    if (fieldCode) query.set("fieldCode", fieldCode);
    return this.get(`/workspaces/${workspaceId}/annotations?${query}`);
  }

  async exchangePreview(
    workspaceId: string,
    format: ExchangeFormat,
    payload: string,
    base = "current",
  ): Promise<ExchangeDiffResult> {
    const query = new URLSearchParams({ base });
    const response = await this.fetchFn(
      `${this.baseUrl}/workspaces/${workspaceId}/exchange/${format}/preview?${query}`,
      {
        method: "POST",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: payload,
      },
    );
    if (!response.ok) throw new Error("交换预览失败");
    return response.json() as Promise<ExchangeDiffResult>;
  }

  async exchangeExport(
    workspaceId: string,
    format: ExchangeFormat,
    objectType?: string | null,
    base = "current",
  ): Promise<ExchangeExportResult> {
    const query = new URLSearchParams({ base });
    if (objectType) query.set("objectType", objectType);
    const response = await this.fetchFn(
      `${this.baseUrl}/workspaces/${workspaceId}/exchange/${format}/export?${query}`,
      {
        headers: {
          accept: format === "reqif" ? "application/xml" : "application/json",
        },
      },
    );
    if (!response.ok) throw new Error("交换导出失败");
    return {
      format,
      payload: await response.text(),
      contentType:
        response.headers.get("content-type") ??
        (format === "reqif" ? "application/xml" : "application/json"),
    };
  }

  objects(
    workspaceId: string,
    objectType: string,
    page = 0,
    pageSize = 50,
  ): Promise<ObjectPage> {
    if (pageSize < 1 || pageSize > 200)
      throw new Error("pageSize must be 1..200");
    const query = new URLSearchParams({
      objectType,
      page: `${page}`,
      pageSize: `${pageSize}`,
    });
    return this.get(`/workspaces/${workspaceId}/views/objects?${query}`);
  }

  object(workspaceId: string, objectId: string): Promise<ObjectDetail> {
    return this.get(`/workspaces/${workspaceId}/views/objects/${objectId}`);
  }

  ruleStatus(
    workspaceId: string,
    objectIds: readonly string[],
  ): Promise<readonly RuleStatusItem[]> {
    if (objectIds.length > 200) throw new Error("objectIds must be <= 200");
    if (objectIds.length === 0) return Promise.resolve([]);
    const query = new URLSearchParams();
    for (const objectId of objectIds) query.append("objectIds", objectId);
    return this.get(`/workspaces/${workspaceId}/views/rule-status?${query}`);
  }

  relations(
    workspaceId: string,
    relationType: string,
    direction: "out" | "in",
    sourceId: string,
    depth: number,
  ): Promise<readonly RelationSummary[]> {
    const query = new URLSearchParams({
      relationType,
      direction,
      sourceId,
      depth: `${boundedDepth(depth)}`,
    });
    return this.get(`/workspaces/${workspaceId}/views/relations?${query}`);
  }

  tree(
    workspaceId: string,
    relationType: string,
    rootId: string,
  ): Promise<readonly TreeNodeSummary[]> {
    const query = new URLSearchParams({ relationType, rootId });
    return this.get(`/workspaces/${workspaceId}/views/tree?${query}`);
  }

  matrix(
    workspaceId: string,
    rowType: string,
    colType: string,
    relationType: string,
    rowPage = 0,
    rowSize = 50,
    colPage = 0,
    colSize = 50,
  ): Promise<MatrixResult> {
    if (
      rowPage < 0 ||
      colPage < 0 ||
      !validMatrixSize(rowSize) ||
      !validMatrixSize(colSize)
    ) {
      throw new Error(
        "matrix pages must be non-negative and sizes must be 1..50",
      );
    }
    const query = new URLSearchParams({
      rowType,
      colType,
      relationType,
      rowPage: `${rowPage}`,
      rowSize: `${rowSize}`,
      colPage: `${colPage}`,
      colSize: `${colSize}`,
    });
    return this.get(`/workspaces/${workspaceId}/views/matrix?${query}`);
  }

  syncStatus(workspaceId: string): Promise<SyncStatus> {
    return this.get(`/workspaces/${workspaceId}/views/sync-status`);
  }

  lineage(
    workspaceId: string,
    objectId: string,
    fieldCode: string,
  ): Promise<LineageView> {
    const query = new URLSearchParams({ objectId, fieldCode });
    return this.get(`/workspaces/${workspaceId}/views/lineage?${query}`);
  }

  /** 触发一次规则校验运行,返回 runId(取自命令结果 events[0])。 */
  async runRuleCheck(
    workspaceId: string,
    actorId: string,
    objectTypeCode?: string | null,
  ): Promise<string> {
    const result = await this.post<{ readonly events?: readonly string[] }>(
      `/workspaces/${workspaceId}/rule-commands`,
      actorId,
      {
        commandType: "RunRuleCheck",
        workspaceId,
        correlationId: crypto.randomUUID(),
        idempotencyKey: `rc-${crypto.randomUUID()}`,
        payload: objectTypeCode ? { scope: { objectTypeCode } } : {},
      },
    );
    const runId = result.events?.[0];
    if (!runId) throw new Error("RunRuleCheck 未返回 runId");
    return runId;
  }

  /** 列出某次校验运行的命中结果(分页)。 */
  checkResults(
    workspaceId: string,
    runId: string,
    page = 0,
    size = 50,
  ): Promise<CheckResultPage> {
    const query = new URLSearchParams({
      runId,
      page: `${page}`,
      size: `${size}`,
    });
    return this.get(`/workspaces/${workspaceId}/views/check-results?${query}`);
  }

  mappingCorrespondences(
    workspaceId: string,
  ): Promise<readonly MappingCorrespondence[]> {
    return this.get(`/workspaces/${workspaceId}/views/mapping/correspondences`);
  }

  mappingCoverage(
    workspaceId: string,
    correspondenceId: string,
    page = 0,
    size = 30,
  ): Promise<MappingCoveragePage> {
    if (page < 0 || size < 1 || size > 50) {
      throw new Error(
        "mapping coverage page must be non-negative and size 1..50",
      );
    }
    const query = new URLSearchParams({
      page: `${page}`,
      size: `${size}`,
    });
    return this.get(
      `/workspaces/${workspaceId}/views/mapping/correspondences/${correspondenceId}/coverage?${query}`,
    );
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error("读取视图数据失败");
    return response.json() as Promise<T>;
  }

  private async getWithActor<T>(path: string, actorId: string): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      headers: { "X-Actor-Id": actorId },
    });
    if (!response.ok) throw new Error("读取视图数据失败");
    return response.json() as Promise<T>;
  }

  private async post<T>(
    path: string,
    actorId: string,
    body: unknown,
  ): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Actor-Id": actorId },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("写入视图制品失败");
    return response.json() as Promise<T>;
  }

  private async postWithoutActor<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("读取差异数据失败");
    return response.json() as Promise<T>;
  }
}

export function boundedDepth(depth: number): number {
  if (!Number.isFinite(depth)) return 1;
  return Math.min(5, Math.max(1, Math.trunc(depth)));
}

function validMatrixSize(size: number): boolean {
  return Number.isInteger(size) && size >= 1 && size <= 50;
}
