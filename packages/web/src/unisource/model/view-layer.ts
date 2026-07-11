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
  readonly avatar: "wang" | "li" | "chen" | "zhou" | "ai";
}

export interface PluginDef {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly forms: readonly string[];
}

export interface SimScenario {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly metrics: readonly {
    readonly name: string;
    readonly value: string;
  }[];
}

export interface RelationCommentRef {
  readonly relationId: DataRelationId;
  readonly commentId: string;
}
