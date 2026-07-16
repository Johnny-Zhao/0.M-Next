import type { ComponentType } from "react";

import type { DataObject, ObjectTypeDef } from "../model/kernel";

export interface DataSourceLifecycleActionProps {
  readonly object: DataObject;
  readonly objectType: ObjectTypeDef;
  readonly onCompleted: (objectId: string) => void;
}

export type DataSourceLifecycleAction =
  ComponentType<DataSourceLifecycleActionProps>;

export class DataSourceLifecycleActionRegistry {
  private readonly actions = new Map<
    string,
    { readonly scope: string; readonly action: DataSourceLifecycleAction }
  >();

  register(
    actionId: string,
    templateCode: string,
    objectTypeCode: string,
    action: DataSourceLifecycleAction,
  ): void {
    const registered = this.actions.get(actionId);
    if (registered?.action === action) return;
    if (registered)
      throw new Error(`数据源生命周期动作“${actionId}”不能覆盖。`);
    this.actions.set(actionId, {
      scope: `${templateCode}:${objectTypeCode}`,
      action,
    });
  }

  resolve(
    templateCode: string | null | undefined,
    objectTypeCode: string,
  ): DataSourceLifecycleAction | null {
    if (!templateCode) return null;
    return (
      [...this.actions.values()].find(
        (entry) => entry.scope === `${templateCode}:${objectTypeCode}`,
      )?.action ?? null
    );
  }
}

export const dataSourceLifecycleActionRegistry =
  new DataSourceLifecycleActionRegistry();

export function DataSourceLifecycleActionOutlet({
  templateCode,
  object,
  objectType,
  onCompleted,
  registry = dataSourceLifecycleActionRegistry,
}: DataSourceLifecycleActionProps & {
  readonly templateCode: string | null | undefined;
  readonly registry?: DataSourceLifecycleActionRegistry;
}) {
  const Action = registry.resolve(templateCode, objectType.code);
  return Action ? (
    <Action object={object} objectType={objectType} onCompleted={onCompleted} />
  ) : null;
}
