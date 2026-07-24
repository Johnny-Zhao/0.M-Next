import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  KERNEL_GATEWAY_CAPABILITIES,
  MOCK_GATEWAY_CAPABILITIES,
} from "../data/gateway";
import { MockUnisourceGateway } from "../data/mock-gateway";
import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  closeExpressionCreateDialog,
  getExpressionCreateDialogState,
  openExpressionCreateDialog,
} from "./expression-create-dialog-store";
import { commitExpressionCreation } from "./expression-create-dialog";
import { ExpressionCreateTrigger } from "./expression-create-trigger";
import type { ExpressionDraft } from "./expression-create-model";

const draft: ExpressionDraft = {
  name: "统一入口表达",
  purpose: "测试",
  rootObjectTypeCode: "product_specs",
  fieldCodes: ["sku", "name"],
  relations: [],
  viewKind: "grid",
  sortFieldCode: "sku",
  sortDirection: "asc",
};

describe("ExpressionCreateDialog boundary", () => {
  it("uses one dialog store and one trigger component for sidebar and home", () => {
    closeExpressionCreateDialog();
    const beforeRevision = getExpressionCreateDialogState().revision;
    openExpressionCreateDialog();
    expect(getExpressionCreateDialogState()).toEqual({
      open: true,
      revision: beforeRevision + 1,
    });
    expect(
      renderToStaticMarkup(<ExpressionCreateTrigger surface="sidebar" />),
    ).toContain("新建表达");
    expect(
      renderToStaticMarkup(<ExpressionCreateTrigger surface="home" />),
    ).toContain("新建表达");
    closeExpressionCreateDialog();
  });

  it("creates and navigates through the shared Gateway in session mode", async () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const navigate = vi.fn();
    const result = await commitExpressionCreation({
      capabilities: MOCK_GATEWAY_CAPABILITIES,
      draft,
      workspace: store.getSnapshot(),
      gateway: new MockUnisourceGateway(cloneDemoSeed(), store),
      navigate,
    });

    expect(result.state).toBe("created");
    const expressionId = store.getSnapshot().expressions.at(-1)?.id;
    expect(expressionId).toMatch(/^exp-/);
    expect(navigate).toHaveBeenCalledWith(`/expr/${expressionId}?form=grid`);
  });

  it("keeps state and form data when persistent creation fails", async () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const before = store.getSnapshot();
    const navigate = vi.fn();
    const createExpressionConfig = vi
      .fn()
      .mockRejectedValue(new Error("当前工作空间已存在同名表达"));
    const result = await commitExpressionCreation({
      capabilities: KERNEL_GATEWAY_CAPABILITIES,
      draft,
      workspace: before,
      gateway: { createExpressionConfig },
      navigate,
    });

    expect(result).toEqual({
      state: "failed",
      message: "当前工作空间已存在同名表达",
    });
    expect(store.getSnapshot()).toBe(before);
    expect(navigate).not.toHaveBeenCalled();
    expect(createExpressionConfig).toHaveBeenCalledTimes(1);
  });

  it("keeps the unavailable capability as an explicit boundary", async () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const result = await commitExpressionCreation({
      capabilities: {
        expressionPersistence: { mode: "unavailable", reason: "暂不可用" },
      },
      draft,
      workspace: store.getSnapshot(),
      gateway: null,
      navigate: vi.fn(),
    });

    expect(result).toEqual({ state: "unavailable", message: "暂不可用" });
  });
});
