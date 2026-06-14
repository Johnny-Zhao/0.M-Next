export interface SelectionRef {
  readonly entityType: "object" | "field" | "relation";
  readonly entityId: string;
  readonly fieldCode?: string;
}

export function isObjectSelected(
  selection: SelectionRef | null,
  entityId: string,
): boolean {
  return selection?.entityType === "object" && selection.entityId === entityId;
}
