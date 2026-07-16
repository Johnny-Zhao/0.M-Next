import type { ComponentType } from "react";

import type { DataObject, ObjectTypeDef } from "../model/kernel";

export interface DataSourceCreateActionProps {
  readonly object: DataObject;
  readonly objectType: ObjectTypeDef;
  readonly onClose: () => void;
  readonly onCompleted: (objectId: string) => void;
}

export type DataSourceCreateAction = ComponentType<DataSourceCreateActionProps>;

export class DataSourceCreateActionRegistry {
  private readonly actions = new Map<
    string,
    { readonly objectTypeCode: string; readonly action: DataSourceCreateAction }
  >();

  register(
    actionId: string,
    templateCode: string,
    objectTypeCode: string,
    action: DataSourceCreateAction,
  ): void {
    const registered = this.actions.get(actionId);
    if (registered?.action === action) return;
    if (registered) {
      throw new Error(`数据源动作“${actionId}”已被其他组件注册，不能覆盖。`);
    }
    this.actions.set(actionId, {
      objectTypeCode: `${templateCode}:${objectTypeCode}`,
      action,
    });
  }

  resolve(
    templateCode: string | null | undefined,
    objectTypeCode: string,
  ): DataSourceCreateAction | null {
    if (!templateCode) return null;
    const registered = [...this.actions.values()].find(
      (entry) => entry.objectTypeCode === `${templateCode}:${objectTypeCode}`,
    );
    return registered?.action ?? null;
  }
}

export const dataSourceCreateActionRegistry =
  new DataSourceCreateActionRegistry();

export function DataSourceCreateActionOutlet({
  templateCode,
  object,
  objectType,
  onClose,
  onCompleted,
  registry = dataSourceCreateActionRegistry,
}: DataSourceCreateActionProps & {
  readonly templateCode: string | null | undefined;
  readonly registry?: DataSourceCreateActionRegistry;
}) {
  const Action = registry.resolve(templateCode, objectType.code);
  if (!Action) return null;
  return (
    <Action
      object={object}
      objectType={objectType}
      onClose={onClose}
      onCompleted={onCompleted}
    />
  );
}
