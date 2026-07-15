export type WorkspaceId = string;
export type DataObjectId = string;
export type DataRelationId = string;
export type FieldCode = string;
export type MemberId = "wangyun" | "lixiao" | "chenmo" | "zhouran" | "ai";
export type DataSource = "manual" | "ai";
export type PermLevel = "admin" | "edit" | "owner" | "readonly" | "none";
export type PermissionMatrix = Record<MemberId, Record<string, PermLevel>>;

export interface Workspace {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly currentMemberId: MemberId;
  readonly updatedAt: string;
}

export interface SlotDef {
  readonly id: string;
  readonly abstractType: string;
  readonly label: string;
  readonly constraints: readonly SlotConstraint[];
  readonly constraintLabels?: readonly string[];
  readonly shownFields: readonly FieldCode[];
  readonly connectsTo?: readonly string[];
}

export interface SlotConstraint {
  readonly field: FieldCode;
  readonly op: "eq" | "gte" | "lte";
  readonly value: DataFieldPrimitive;
}

export interface SceneTemplate {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly slots: readonly SlotDef[];
}

export type FieldDataType =
  | "text"
  | "number"
  | "enum"
  | "date"
  | "person"
  | "docLink";

export interface FieldDef {
  readonly code: FieldCode;
  readonly name: string;
  readonly dataType: FieldDataType;
  readonly enumValues?: readonly string[];
  readonly unit?: string;
  readonly computed?: boolean;
  readonly readOnly?: boolean;
}

export interface ObjectTypeDef {
  readonly code: string;
  readonly name: string;
  readonly group: string;
  readonly fields: readonly FieldDef[];
}

export type DataFieldPrimitive = string | number | boolean | null;

export interface DataFieldValue {
  readonly value: DataFieldPrimitive;
  readonly fieldVersion: number;
  readonly updatedBy: MemberId;
  readonly updatedAt: string;
  readonly source: DataSource;
}

export type DataObjectStatus =
  | "draft"
  | "active"
  | "presale"
  | "dev"
  | "sale"
  | "eol"
  | "archived"
  | "deleted"
  | "soft-deleted";

export interface DataObject {
  readonly id: DataObjectId;
  readonly objectTypeCode: string;
  readonly status: DataObjectStatus;
  readonly version: number;
  readonly fields: Record<FieldCode, DataFieldValue>;
  readonly createdBy: MemberId;
  readonly createdAt: string;
  readonly updatedBy: MemberId;
  readonly updatedAt: string;
}

export interface RelationType {
  readonly code: string;
  readonly name: string;
  readonly sourceTypeCode: string;
  readonly targetTypeCode: string;
}

export type DataRelationStatus = "active" | "unlinked";

export interface DataRelation {
  readonly id: DataRelationId;
  readonly relationTypeCode: string;
  readonly sourceId: DataObjectId;
  readonly targetId: DataObjectId;
  readonly status: DataRelationStatus;
  readonly fields: Record<FieldCode, DataFieldValue>;
  readonly version: number;
  readonly annotationIds: readonly string[];
}

export type ViewKind = "grid" | "doc" | "canvas" | "matrix" | "bi" | "ana";

export interface ViewDef {
  readonly id: string;
  readonly exprId: string;
  readonly kind: ViewKind;
  readonly config: Record<string, unknown>;
}

export interface SelectionRef {
  readonly entityType: "object" | "field" | "relation";
  readonly entityId: string;
  readonly fieldCode?: FieldCode;
}

export type CheckLevel = "error" | "warning" | "passed";

export interface CheckResult {
  readonly id: string;
  readonly ruleCode: string;
  readonly group: string;
  readonly level: CheckLevel;
  readonly detail: string;
  readonly impact: readonly string[];
  readonly fixActions: readonly string[];
}

export interface Comment {
  readonly id: string;
  readonly anchor: SelectionRef;
  readonly body: string;
  readonly author: MemberId;
  readonly at: string;
  readonly resolved: boolean;
}

export interface ReviewRecord {
  readonly id: string;
  readonly target: SelectionRef;
  readonly action: "submit" | "approve" | "reject" | "accept";
  readonly actor: MemberId;
  readonly at: string;
  readonly note: string;
}

export type ChangeSetStatus = "pending" | "resolved" | "rejected";

export interface ChangeItem {
  readonly id: string;
  readonly op: "updateField" | "createObject" | "createRelation";
  readonly target: SelectionRef;
  readonly objectTypeCode?: string;
  readonly fields?: Record<FieldCode, DataFieldPrimitive>;
  readonly oldValue?: DataFieldPrimitive;
  readonly nextValue?: DataFieldPrimitive;
  readonly confidence?: number;
  readonly needsConfirm?: boolean;
  readonly confirmed?: boolean;
  readonly applied?: boolean;
  readonly note?: string;
}

export interface ChangeSet {
  readonly id: string;
  readonly source: DataSource;
  readonly status: ChangeSetStatus;
  readonly title: string;
  readonly actor: MemberId;
  readonly createdAt: string;
  readonly items: readonly ChangeItem[];
}

export type AIChangeSet = ChangeSet & { readonly source: "ai" };
export type AIChangeItem = ChangeItem;

export interface OutputSnapshot {
  readonly id: string;
  readonly scope: string;
  readonly createdAt: string;
  readonly payload: {
    readonly title: string;
    readonly summary: string;
  };
}
