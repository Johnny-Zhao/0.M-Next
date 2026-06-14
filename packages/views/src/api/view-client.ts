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

export interface ViewObject {
  readonly objectId: string;
  readonly objectType: string;
  readonly status: string;
  readonly version: number;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
}

export interface RelationSummary {
  readonly relationId: string;
  readonly relationType: string;
  readonly sourceId: string;
  readonly targetId: string;
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

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ViewClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  objectTypes(workspaceId: string): Promise<readonly ObjectType[]> {
    return this.get(`/workspaces/${workspaceId}/views/object-types`);
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

  syncStatus(workspaceId: string): Promise<SyncStatus> {
    return this.get(`/workspaces/${workspaceId}/views/sync-status`);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error("读取视图数据失败");
    return response.json() as Promise<T>;
  }
}

export function boundedDepth(depth: number): number {
  if (!Number.isFinite(depth)) return 1;
  return Math.min(5, Math.max(1, Math.trunc(depth)));
}
