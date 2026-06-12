import type { ReactElement } from "react";

export interface ReadModel {
  readonly title: string;
}

export function ReadModelView({ model }: { model: ReadModel }): ReactElement {
  return <section aria-label="read-model">{model.title}</section>;
}
