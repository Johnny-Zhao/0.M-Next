import type { ComponentType } from "react";

export interface StructuredDocumentActionProps {
  readonly rootObjectId: string;
}

export class StructuredDocumentActionRegistry {
  private readonly actions = new Map<
    string,
    ComponentType<StructuredDocumentActionProps>
  >();

  register(
    actionId: string,
    action: ComponentType<StructuredDocumentActionProps>,
  ): void {
    const registered = this.actions.get(actionId);
    if (registered === action) return;
    if (registered) {
      throw new Error(`文档动作“${actionId}”已由其他组件注册，不能覆盖。`);
    }
    this.actions.set(actionId, action);
  }

  resolve(
    actionId: string,
  ): ComponentType<StructuredDocumentActionProps> | null {
    return this.actions.get(actionId) ?? null;
  }
}

export const structuredDocumentActionRegistry =
  new StructuredDocumentActionRegistry();

export function StructuredDocumentActionOutlet({
  actionId,
  registry = structuredDocumentActionRegistry,
  rootObjectId,
}: {
  readonly actionId: string | undefined;
  readonly registry?: StructuredDocumentActionRegistry;
  readonly rootObjectId: string;
}) {
  if (!actionId) return null;
  const Action = registry.resolve(actionId);
  if (!Action) {
    return <p role="status">此文档动作当前不可用。</p>;
  }
  return <Action rootObjectId={rootObjectId} />;
}
