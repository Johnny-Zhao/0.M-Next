import type { CommandClient, ViewClient, ViewObject } from "@m-next/views";
import { describe, expect, it, vi } from "vitest";

import {
  clearDiagramClipboard,
  copyObjectsToClipboard,
  hasDiagramClipboard,
  readDiagramClipboard,
} from "./clipboard";
import {
  createObjectByCommand,
  diagramShortcutFromEvent,
  resolveObjectTypeId,
  softDeleteObjectByCommand,
} from "./shortcuts";

describe("diagram shortcuts", () => {
  it("maps keyboard events to diagram actions", () => {
    expect(diagramShortcutFromEvent(key("Delete"))).toBe("delete");
    expect(diagramShortcutFromEvent(key("Backspace"))).toBe("delete");
    expect(diagramShortcutFromEvent(key("Escape"))).toBe("clearSelection");
    expect(diagramShortcutFromEvent(key("a", true))).toBe("selectAll");
    expect(diagramShortcutFromEvent(key("c", true))).toBe("copy");
    expect(diagramShortcutFromEvent(key("d", true))).toBe("duplicate");
    expect(diagramShortcutFromEvent(key("v", true))).toBe("paste");
    expect(diagramShortcutFromEvent(key("x"))).toBeNull();
  });

  it("keeps copied objects in memory only", () => {
    clearDiagramClipboard();
    expect(hasDiagramClipboard()).toBe(false);
    copyObjectsToClipboard([object("obj-a", { name: "A" })]);
    expect(hasDiagramClipboard()).toBe(true);
    expect(readDiagramClipboard()?.objects[0]).toEqual({
      objectType: "demo_object",
      fields: { name: "A" },
    });
  });

  it("posts create and soft delete through CommandClient", async () => {
    const post = vi.fn(async () => undefined);
    const client = { post } as unknown as CommandClient;
    const viewClient = objectTypeClient();
    const source = object("obj-a", { name: "A" });

    await createObjectByCommand(
      client,
      viewClient,
      "workspace-1",
      "demo_object",
      source.fields,
      "copy",
    );
    await softDeleteObjectByCommand(client, "workspace-1", source);

    expect(post.mock.calls[0]).toEqual([
      "CreateObject",
      "workspace-1",
      {
        objectTypeId: "type-1",
        fields: { name: "A" },
        source: { type: "manual", ref: "copy" },
        initialState: "DRAFT",
      },
    ]);
    expect(post.mock.calls[1]).toEqual([
      "SoftDelete",
      "workspace-1",
      {
        targetType: "object",
        targetId: "obj-a",
        reason: "diagram-delete",
        expectedVersion: 7,
        relationPolicy: "reject",
      },
    ]);
  });

  it("resolves object type code before posting create commands", async () => {
    await expect(
      resolveObjectTypeId(objectTypeClient(), "workspace-1", "demo_object"),
    ).resolves.toBe("type-1");
  });

  it("does not post create commands when object type code is unknown", async () => {
    const post = vi.fn(async () => undefined);

    await expect(
      createObjectByCommand(
        { post } as unknown as CommandClient,
        objectTypeClient(),
        "workspace-1",
        "missing_type",
        {},
        "copy",
      ),
    ).rejects.toThrow("未找到对象类型: missing_type");
    expect(post).not.toHaveBeenCalled();
  });
});

function key(keyName: string, command = false): KeyboardEvent {
  return {
    ctrlKey: command,
    key: keyName,
    metaKey: false,
    target: null,
  } as KeyboardEvent;
}

function object(
  objectId: string,
  fields: Readonly<Record<string, unknown>>,
): ViewObject {
  return {
    objectId,
    objectType: "demo_object",
    status: "DRAFT",
    version: 7,
    fields,
    updatedAt: "2026-06-21T00:00:00Z",
    source: null,
    ruleStatus: "OK",
  };
}

function objectTypeClient(): Pick<ViewClient, "objectTypes"> {
  return {
    objectTypes: vi.fn(async () => [
      { id: "type-1", code: "demo_object", name: "Demo", fields: [] },
    ]),
  };
}
