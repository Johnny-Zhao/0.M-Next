import { describe, expect, it, vi } from "vitest";

import type { ObjectType, RelationType, ViewObject } from "@m-next/views";

import {
  createTechnicalObject,
  findObjectTypeId,
  findRelationTypeId,
  validateCreateObjectForm,
} from "./create-object-form";

describe("create-object-form", () => {
  it("validates module fields and coerces power to number", () => {
    expect(
      validateCreateObjectForm({
        kind: "module",
        values: { name: "", responsibility: "", power_w: "10" },
      }),
    ).toMatchObject({ ok: false, message: "请填写模块名称" });

    expect(
      validateCreateObjectForm({
        kind: "module",
        values: { name: "电源模块", responsibility: "供电", power_w: "12.5" },
      }),
    ).toEqual({
      ok: true,
      message: "",
      fields: { name: "电源模块", responsibility: "供电", power_w: 12.5 },
    });
  });

  it("validates requirement fields before submitting", () => {
    expect(
      validateCreateObjectForm({
        kind: "requirement",
        values: { code: "REQ-1", text: "", priority: "高" },
      }),
    ).toMatchObject({ ok: false, message: "请填写需求内容" });

    expect(
      validateCreateObjectForm({
        kind: "requirement",
        values: { code: "REQ-1", text: "保持供电", priority: "高" },
      }),
    ).toEqual({
      ok: true,
      message: "",
      fields: { code: "REQ-1", text: "保持供电", priority: "高" },
    });
  });

  it("resolves object and relation type ids by code", () => {
    expect(
      findObjectTypeId([objectType("module", "type-module")], "module"),
    ).toBe("type-module");
    expect(
      findRelationTypeId(
        [relationType("proposal_contains_module", "rel-contains-module")],
        "proposal_contains_module",
      ),
    ).toBe("rel-contains-module");
  });

  it("creates a module and attaches it to the proposal root", async () => {
    const harness = createHarness({ module: [] });
    harness.onCreateObject("type-module", () =>
      harness.addObject("module", viewObject("module-new", "module")),
    );

    const result = await createTechnicalObject({
      viewClient: harness.viewClient,
      commandClient: harness.commandClient,
      workspaceId: "ws",
      rootId: "proposal-root",
      form: {
        kind: "module",
        values: { name: "电源模块", responsibility: "供电", power_w: "20" },
      },
      attempts: 1,
      delay: async () => undefined,
    });

    expect(result).toEqual({ kind: "module", objectId: "module-new" });
    expect(harness.commandClient.createObject).toHaveBeenCalledWith(
      "ws",
      "type-module",
      { name: "电源模块", responsibility: "供电", power_w: 20 },
      "DRAFT",
    );
    expect(harness.commandClient.createRelation).toHaveBeenCalledWith(
      "ws",
      "rel-contains-module",
      "proposal-root",
      "module-new",
      "create-object-form",
    );
  });

  it("creates a system and attaches it to the proposal root", async () => {
    const harness = createHarness({ system: [] });
    harness.onCreateObject("type-system", () =>
      harness.addObject("system", viewObject("system-new", "system")),
    );

    const result = await createTechnicalObject({
      viewClient: harness.viewClient,
      commandClient: harness.commandClient,
      workspaceId: "ws",
      rootId: "proposal-root",
      form: {
        kind: "system",
        values: { name: "电源分系统", responsibility: "供配电" },
      },
      attempts: 1,
      delay: async () => undefined,
    });

    expect(result).toEqual({ kind: "system", objectId: "system-new" });
    expect(harness.commandClient.createObject).toHaveBeenCalledWith(
      "ws",
      "type-system",
      { name: "电源分系统", responsibility: "供配电" },
      "DRAFT",
    );
    expect(harness.commandClient.createRelation).toHaveBeenCalledWith(
      "ws",
      "rel-contains-system",
      "proposal-root",
      "system-new",
      "create-object-form",
    );
  });

  it("does not create a module before the proposal root is ready", async () => {
    const harness = createHarness({ module: [] });

    await expect(
      createTechnicalObject({
        viewClient: harness.viewClient,
        commandClient: harness.commandClient,
        workspaceId: "ws",
        rootId: "",
        form: {
          kind: "module",
          values: { name: "电源模块", responsibility: "", power_w: "0" },
        },
        attempts: 1,
        delay: async () => undefined,
      }),
    ).rejects.toThrow("方案根尚未就绪");
    expect(harness.commandClient.createObject).not.toHaveBeenCalled();
  });

  it("creates a requirement without attaching a contains relation", async () => {
    const harness = createHarness({ requirement: [] });
    harness.onCreateObject("type-requirement", () =>
      harness.addObject("requirement", viewObject("req-new", "requirement")),
    );

    const result = await createTechnicalObject({
      viewClient: harness.viewClient,
      commandClient: harness.commandClient,
      workspaceId: "ws",
      rootId: "proposal-root",
      form: {
        kind: "requirement",
        values: { code: "REQ-1", text: "保持供电", priority: "高" },
      },
      attempts: 1,
      delay: async () => undefined,
    });

    expect(result).toEqual({ kind: "requirement", objectId: "req-new" });
    expect(harness.commandClient.createObject).toHaveBeenCalledWith(
      "ws",
      "type-requirement",
      { code: "REQ-1", text: "保持供电", priority: "高" },
      "DRAFT",
    );
    expect(harness.commandClient.createRelation).not.toHaveBeenCalled();
  });

  it("creates an interface without attaching a contains relation", async () => {
    const harness = createHarness({ interface: [] });
    harness.onCreateObject("type-interface", () =>
      harness.addObject("interface", viewObject("interface-new", "interface")),
    );

    const result = await createTechnicalObject({
      viewClient: harness.viewClient,
      commandClient: harness.commandClient,
      workspaceId: "ws",
      rootId: "proposal-root",
      form: {
        kind: "interface",
        values: {
          name: "CAN 接口",
          direction: "out",
          protocol: "CAN",
          data: "telemetry",
        },
      },
      attempts: 1,
      delay: async () => undefined,
    });

    expect(result).toEqual({
      kind: "interface",
      objectId: "interface-new",
    });
    expect(harness.commandClient.createObject).toHaveBeenCalledWith(
      "ws",
      "type-interface",
      {
        name: "CAN 接口",
        direction: "out",
        protocol: "CAN",
        data: "telemetry",
      },
      "DRAFT",
    );
    expect(harness.commandClient.createRelation).not.toHaveBeenCalled();
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
    })),
  };
  const commandClient = {
    createObject: vi.fn(async (_workspaceId: string, objectTypeId: string) => {
      createHandlers.get(objectTypeId)?.();
    }),
    createRelation: vi.fn(async () => undefined),
  };
  return {
    viewClient,
    commandClient,
    addObject: (objectTypeCode: string, object: ViewObject): void => {
      objects[objectTypeCode] = [...(objects[objectTypeCode] ?? []), object];
    },
    onCreateObject: (objectTypeId: string, handler: () => void): void => {
      createHandlers.set(objectTypeId, handler);
    },
  };
}

function objectType(code: string, id: string): ObjectType {
  return { id, code, name: code, fields: [] };
}

function relationType(code: string, id: string): RelationType {
  return { id, code, name: code, hierarchical: false };
}

function viewObject(objectId: string, objectTypeCode: string): ViewObject {
  return {
    objectId,
    objectType: objectTypeCode,
    status: "DRAFT",
    version: 1,
    fields: { name: objectId },
    updatedAt: "2026-07-09T00:00:00Z",
    source: null,
    ruleStatus: "OK",
  };
}
