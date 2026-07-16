import type { ReactElement } from "react";

export interface ReadModel {
  readonly title: string;
}

export function ReadModelView({ model }: { model: ReadModel }): ReactElement {
  return <section aria-label="read-model">{model.title}</section>;
}

export * from "./api/command-client";
export * from "./api/field-coerce";
export * from "./api/update-single-field";
export * from "./api/view-client";
export * from "./conflict/conflict-dialog";
export * from "./detail/detail-panel";
export * from "./display-labels";
export * from "./document/document-view";
export * from "./document/body-editor";
export * from "./graph/graph-view";
export * from "./mapping/mapping-view";
export * from "./matrix/matrix-view";
export * from "./selection/selection-coordinator";
export * from "./selection/selection-ref";
export * from "./table/table-view";
export * from "./timeline/time-playhead";
export * from "./tree/tree-view";
