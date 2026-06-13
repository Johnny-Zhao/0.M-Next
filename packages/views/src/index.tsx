import type { ReactElement } from "react";

export interface ReadModel {
  readonly title: string;
}

export function ReadModelView({ model }: { model: ReadModel }): ReactElement {
  return <section aria-label="read-model">{model.title}</section>;
}

export * from "./api/command-client";
export * from "./api/view-client";
export * from "./conflict/conflict-dialog";
export * from "./detail/detail-panel";
export * from "./graph/graph-view";
export * from "./selection/selection-coordinator";
export * from "./selection/selection-ref";
export * from "./table/table-view";
export * from "./tree/tree-view";
