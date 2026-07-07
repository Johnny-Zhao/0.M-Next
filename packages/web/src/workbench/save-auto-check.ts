import type { ViewClient } from "@m-next/views";

export interface SaveAutoCheckContext {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly viewClient: Pick<ViewClient, "runRuleCheck">;
  readonly refreshViews: () => void;
}

export async function runSaveAutoCheck(
  context: SaveAutoCheckContext,
): Promise<void> {
  context.refreshViews();
  try {
    await context.viewClient.runRuleCheck(
      context.workspaceId,
      context.actorId,
      null,
    );
    context.refreshViews();
  } catch {
    // 保存结果优先;手动「重新校验」仍可重试。
  }
}
