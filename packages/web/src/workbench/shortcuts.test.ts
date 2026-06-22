import type { CommandClient, ViewObject } from "@m-next/views";
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
    const source = object("obj-a", { name: "A" });

    await createObjectByCommand(
      client,
      "workspace-1",
      "type-1",
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
