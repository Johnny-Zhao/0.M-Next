import type {
  DataFieldPrimitive,
  DataObjectId,
  DataRelationId,
  FieldCode,
  MemberId,
  SelectionRef,
  ViewKind,
} from "./kernel";

export interface Expression {
  readonly id: string;
  readonly name: string;
  readonly space?: "main" | "workshop";
  readonly viewIds: readonly string[];
  readonly defaultViewId: string;
  readonly defaultForm: ViewKind;
  readonly activityMember: MemberId;
  readonly lastActivity: string;
}

export type FieldRefState =
  | "fresh"
  | "justSynced"
  | "inserting"
  | "lowConfidence"
  | "dangling";

export interface FieldRef {
  readonly id: string;
  readonly objectId: DataObjectId;
  readonly fieldCode: FieldCode;
  readonly exprId: string;
  readonly label: string;
  readonly state: FieldRefState;
  readonly confidence?: number;
}

export type DocInline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "ref"; readonly refId: string };

export type DocBlock =
  | { readonly kind: "meta"; readonly items: readonly string[] }
  | { readonly kind: "h1"; readonly text: string; readonly refId?: string }
  | { readonly kind: "h2"; readonly text: string }
  | {
      readonly kind: "paragraph";
      readonly id: string;
      readonly inlines: readonly DocInline[];
    }
  | {
      readonly kind: "dataTable";
      readonly id: string;
      readonly title: string;
      readonly sourceLabel: string;
      readonly rows: readonly {
        readonly label: string;
        readonly refId: string;
      }[];
    };

export interface DocModel {
  readonly exprId: string;
  readonly docNo: string;
  readonly template: string;
  readonly binding: {
    readonly objectId: DataObjectId;
    readonly state?: "fresh" | "dangling";
  };
  readonly authorLine: string;
  readonly blocks: readonly DocBlock[];
}

export type ChangeTrack = "data" | "view";

export interface ChangeEventInverse {
  readonly objectId: DataObjectId;
  readonly fieldCode: FieldCode;
  readonly value: DataFieldPrimitive;
}

export interface ChangeEvent {
  readonly id: string;
  readonly track: ChangeTrack;
  readonly actor: MemberId;
  readonly viaAi?: boolean;
  readonly target: SelectionRef;
  readonly old?: DataFieldPrimitive;
  readonly next?: DataFieldPrimitive;
  readonly syncedRefs: number;
  readonly at: string;
  readonly inverse: ChangeEventInverse | null;
  readonly inverseView?: {
    readonly viewId: string;
    readonly config: Record<string, unknown>;
  } | null;
  readonly inverseKpi?: {
    readonly kpiId: string;
    readonly visible: boolean;
  } | null;
}

export interface ActivityItem {
  readonly id: string;
  readonly actor: MemberId;
  readonly summary: string;
  readonly tracks: readonly ChangeTrack[];
  readonly at: string;
}

export interface Member {
  readonly id: MemberId;
  readonly name: string;
  readonly role: string;
  readonly dept: string;
  readonly email: string;
  readonly avatar: "wang" | "li" | "chen" | "zhou" | "ai";
}

export interface SlotBinding {
  readonly id: string;
  readonly templateId: string;
  readonly slotId: string;
  readonly exprId: string;
  readonly objectId: DataObjectId | null;
  readonly state?: "fresh" | "dangling";
  readonly updatedBy: MemberId;
  readonly updatedAt: string;
}

export interface CanvasNodeConfig {
  readonly objectId: DataObjectId;
  readonly state?: "fresh" | "dangling";
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly style?: {
    readonly fill?: string;
    readonly color?: string;
    readonly fontSize?: number;
    readonly radius?: number;
  };
  readonly shownFields?: readonly FieldCode[];
  readonly visibility?: {
    readonly sourceBadge?: boolean;
    readonly fieldRows?: boolean;
    readonly docBadge?: boolean;
    readonly edgeLabels?: boolean;
  };
}

export interface CanvasEdgeConfig {
  readonly relationId: DataRelationId;
  readonly state?: "fresh" | "dangling";
}

export interface CanvasConfig {
  readonly nodes: readonly CanvasNodeConfig[];
  readonly edges: readonly CanvasEdgeConfig[];
}

export type PluginIndustry =
  | "制造业"
  | "建筑工程"
  | "医疗健康"
  | "金融"
  | "法务合规"
  | "教育科研";

export interface PluginFormDef {
  readonly code: string;
  readonly name: string;
  readonly desc: string;
}

export interface PluginContract {
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly writeNote?: string;
}

export interface PluginDef {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly vendor: string;
  readonly industry: PluginIndustry;
  readonly tagline: string;
  readonly formsProvided: readonly PluginFormDef[];
  readonly contract: PluginContract;
  readonly scope: "all" | "group";
  readonly scopeGroupLabel?: string;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly updateTo?: string;
  readonly beta?: boolean;
  readonly usedByExprIds: readonly string[];
}

export interface SimScenario {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly events: readonly SimEvent[];
}

export interface SimEvent {
  readonly id: string;
  readonly nodeObjectId: DataObjectId;
  readonly viaRelationId?: DataRelationId;
  readonly state?: "fresh" | "dangling";
  readonly label: string;
  readonly kind: "source" | "relay" | "action";
  readonly check?: boolean;
}

export interface KpiCardDef {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly deltaSign: "up" | "down" | "flat";
  readonly sourceLabel: string;
  readonly aiAdded?: boolean;
  readonly visible: boolean;
}

export interface BiBarDef {
  readonly label: string;
  readonly value: number;
  readonly percent: number;
  readonly tone: "high" | "mid" | "low";
}

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "ai";
  readonly text: string;
  readonly actionCardIds?: readonly string[];
}

export interface RawImportSpan {
  readonly start: number;
  readonly end: number;
  readonly tone: "primary" | "change";
}

export interface RawImport {
  readonly text: string;
  readonly spans: readonly RawImportSpan[];
  readonly semanticChips: readonly {
    readonly label: string;
    readonly confidence: number;
  }[];
  readonly recent: readonly {
    readonly id: string;
    readonly title: string;
    readonly at: string;
  }[];
}

export interface RelationCommentRef {
  readonly relationId: DataRelationId;
  readonly commentId: string;
}

export interface AnaReport {
  readonly id: string;
  readonly viewId: string;
  readonly scopeLabel: string;
  readonly question: string;
  readonly sourcesLabel: string;
  readonly factorTitle: string;
  readonly factorMetricLabel: string;
  readonly factors: readonly {
    readonly label: string;
    readonly deltaText: string;
    readonly widthPct: number;
    readonly tone: "change" | "change-soft" | "primary" | "ink";
  }[];
  readonly drillTitle: string;
  readonly drillTraceLabel: string;
  readonly drillColumns: readonly {
    readonly key: string;
    readonly label: string;
  }[];
  readonly drillRows: readonly Readonly<Record<string, string>>[];
  readonly insights: readonly {
    readonly title: string;
    readonly segments: readonly {
      readonly text: string;
      readonly mono?: boolean;
    }[];
  }[];
  readonly pinKpiId: string;
  readonly childKpiIds: readonly string[];
  readonly childActionLabel: string;
}
