import type { ComponentType } from "react";

import type { DataObject, ObjectTypeDef } from "../model/kernel";

export interface DataSourceRelationActionProps {
  readonly object: DataObject;
  readonly objectType: ObjectTypeDef;
  readonly onCompleted: (objectId: string) => void;
}

export type DataSourceRelationAction =
  ComponentType<DataSourceRelationActionProps>;

export class DataSourceRelationActionRegistry {
  private readonly actions = new Map<
    string,
    { readonly scope: string; readonly action: DataSourceRelationAction }
  >();

  register(
    actionId: string,
    templateCode: string,
    objectTypeCode: string,
    action: DataSourceRelationAction,
  ): void {
    const registered = this.actions.get(actionId);
    if (registered?.action === action) return;
    if (registered) {
      throw new Error(
        `数据源关系动作“${actionId}”已被其他组件注册，不能覆盖。`,
      );
    }
    this.actions.set(actionId, {
      scope: `${templateCode}:${objectTypeCode}`,
      action,
    });
  }

  resolve(
    templateCode: string | null | undefined,
    objectTypeCode: string,
  ): DataSourceRelationAction | null {
    if (!templateCode) return null;
    return (
      [...this.actions.values()].find(
        (entry) => entry.scope === `${templateCode}:${objectTypeCode}`,
      )?.action ?? null
    );
  }
}

export const dataSourceRelationActionRegistry =
  new DataSourceRelationActionRegistry();

export function DataSourceRelationActionOutlet({
  templateCode,
  object,
  objectType,
  onCompleted,
  registry = dataSourceRelationActionRegistry,
}: DataSourceRelationActionProps & {
  readonly templateCode: string | null | undefined;
  readonly registry?: DataSourceRelationActionRegistry;
}) {
  const Action = registry.resolve(templateCode, objectType.code);
  return Action ? (
    <Action object={object} objectType={objectType} onCompleted={onCompleted} />
  ) : null;
}
