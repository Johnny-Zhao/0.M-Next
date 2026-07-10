import { describe, expect, it, vi } from "vitest";

import type { ViewObject } from "@m-next/views";

import { createDiagramToolObject } from "./diagram-tools-panel";
import {
  diagramPaletteItems,
  nextConnectionMode,
  paletteObjectForm,
} from "./diagram-tool-model";

describe("diagram tools panel model", () => {
  it("declares the expected technical proposal palette entries", () => {
    expect(diagramPaletteItems.map((item) => item.kind)).toEqual([
      "system",
      "module",
      "interface",
      "requirement",
    ]);
    expect(diagramPaletteItems.map((item) => item.label)).toEqual([
      "分系统",
      "组件",
      "接口",
      "需求",
    ]);
  });

  it("builds default palette creation forms", () => {
    expect(paletteObjectForm("system", 0)).toEqual({
      kind: "system",
      values: { name: "新建分系统", responsibility: "" },
    });
    expect(paletteObjectForm("module", 0)).toMatchObject({
      kind: "module",
      values: { name: "新建组件", power_w: "0" },
    });
    expect(paletteObjectForm("interface", 0)).toMatchObject({
      kind: "interface",
      values: { name: "新建接口", direction: "out" },
    });
    expect(paletteObjectForm("requirement", 2)).toEqual({
      kind: "requirement",
      values: { code: "REQ-003", text: "新建需求", priority: "MUST" },
    });
  });

  it("toggles and exits connection mode", () => {
    expect(nextConnectionMode(false, "toggle")).toBe(true);
    expect(nextConnectionMode(true, "toggle")).toBe(false);
    expect(nextConnectionMode(true, "escape")).toBe(false);
    expect(nextConnectionMode(true, "connected")).toBe(true);
    expect(nextConnectionMode(false, "connected")).toBe(false);
    expect(nextConnectionMode(true, "selectTool")).toBe(false);
    expect(nextConnectionMode(true, "viewChanged")).toBe(false);
  });

  it("creates a module through the shared technical object path", async () => {
    const harness = createHarness({ module: [] });
    harness.onCreateObject("type-module", () =>
      harness.addObject("module", viewObject("module-new", "module")),
    );
    const refreshViews = vi.fn();
    const select = vi.fn();
    const scheduleRefresh = vi.fn((callback: () => void) => callback());

    const result = await createDiagramToolObject({
      context: {
        viewClient: harness.viewClient,
        commandClient: harness.commandClient,
        workspaceId: "ws",
        rootId: "proposal-root",
        refreshViews,
        selection: { select },
      },
      kind: "module",
      scheduleRefresh,
    });

    expect(result).toEqual({ kind: "module", objectId: "module-new" });
    expect(harness.commandClient.createRelation).toHaveBeenCalledWith(
      "ws",
      "rel-contains-module",
      "proposal-root",
      "module-new",
      "create-object-form",
    );
    expect(refreshViews).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledWith({
      entityType: "object",
      entityId: "module-new",
    });
  });
});

function createHarness(seed: Record<string, ViewObject[]>) {
  const objects: Record<string, ViewObject[]> = { ...seed };
  const createHandlers = new Map<string, () => void>();
  const viewClient = {
    objectTypes: vi.fn(async () => [
      objectType("system", "type-system"),
      objectType("module", "type-module"),
      objectType("interface", "type-interface"),
      objectType("requirement", "type-requirement"),
    ]),
    relationTypes: vi.fn(async () => [
      relationType("proposal_contains_system", "rel-contains-system"),
      relationType("proposal_contains_module", "rel-contains-module"),
    ]),
    objects: vi.fn(async (_workspaceId: string, objectTypeCode: string) => ({
      items: objects[objectTypeCode] ?? [],
      page: 0,
      pageSize: 100,
      total: objects[objectTypeCode]?.length ?? 0,
    })),
  };
  const commandClient = {
    createObject: vi.fn(async (_workspaceId: string, typeId: string) => {
      createHandlers.get(typeId)?.();
    }),
    createRelation: vi.fn(async () => undefined),
  };
  return {
    viewClient,
    commandClient,
    addObject(objectTypeCode: string, object: ViewObject): void {
      objects[objectTypeCode] = [...(objects[objectTypeCode] ?? []), object];
    },
    onCreateObject(typeId: string, handler: () => void): void {
      createHandlers.set(typeId, handler);
    },
  };
}

function objectType(code: string, id: string) {
  return { code, id, name: code, fields: [] };
}

function relationType(code: string, id: string) {
  return { code, id, name: code, hierarchical: false };
}

function viewObject(objectId: string, objectType: string): ViewObject {
  return {
    objectId,
    objectType,
    fields: { name: objectId },
    status: "DRAFT",
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    source: null,
    ruleStatus: "OK",
  };
}
