export interface SelectionRef {
  readonly entityType: "object" | "field" | "relation";
  readonly entityId: string;
  readonly fieldCode?: string;
}
