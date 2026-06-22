import { describe, expect, it, vi } from "vitest";

import { CommandFailure, type CommandClient } from "../api/command-client";
import type { ObjectPage, ObjectType, ViewObject } from "../api/view-client";
import { ConflictDialog } from "../conflict/conflict-dialog";
import { SelectionCoordinator } from "../selection/selection-coordinator";
import {
  buildDocumentSections,
  canEditDocumentField,
  canInlineEditDocumentField,
  isDocumentSelection,
  replaceDocumentField,
  saveDocumentField,
  selectDocumentField,
  selectDocumentObject,
} from "./document-view";

const types: readonly ObjectType[] = [
  {
    id: "type",
    code: "requirement",
    name: "需求",
    fields: [
      {
        code: "name",
        name: "名称",
        dataType: "string",
        required: true,
        constraints: {},
      },
      {
        code: "body",
        name: "正文",
        dataType: "text",
        required: false,
        constraints: {},
      },
    ],
  },
];

describe("DocumentView", () => {
  it("builds ordered indented sections with field labels and values", () => {
    const sections = buildDocumentSections(
      "root",
      [
        { sourceId: "root", targetId: "child", depth: 1 },
        { sourceId: "child", targetId: "terminal", depth: 2 },
      ],
      [page(object("root", "Root"), object("child", "Child"), terminal())],
      types,
    );

    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.depth)).toEqual([0, 1, 2]);
    expect(sections[1]?.title).toBe("Child");
    expect(
      sections[1]?.fields.map(
        (field) => `${field.definition.name}:${String(field.value)}`,
      ),
    ).toEqual(["名称:Child", "正文:Child body"]);
  });

  it("selects a field and recognizes external field selection", () => {
    const selection = new SelectionCoordinator();
    const listener = vi.fn();
    selection.subscribe(listener);

    selectDocumentField(selection, "child", "body");

    expect(selection.current()).toEqual({
      entityType: "field",
      entityId: "child",
      fieldCode: "body",
    });
    expect(isDocumentSelection(selection.current(), "child", "body")).toBe(
      true,
    );
    expect(listener).toHaveBeenCalled();
  });

  it("selects a section title at object level", () => {
    const selection = new SelectionCoordinator();

    selectDocumentObject(selection, "child");

    expect(selection.current()).toEqual({
      entityType: "object",
      entityId: "child",
    });
    expect(isDocumentSelection(selection.current(), "child")).toBe(true);
    expect(isDocumentSelection(selection.current(), "child", "body")).toBe(
      false,
    );
  });

  it("marks terminal objects readonly", () => {
    const sections = buildDocumentSections(
      "terminal",
      [],
      [page(terminal())],
      types,
    );

    expect(sections[0]?.terminal).toBe(true);
    expect(canEditDocumentField(sections[0]!)).toBe(false);
    expect(canInlineEditDocumentField(sections[0]!, commandClient())).toBe(
      false,
    );
  });

  it("submits UpdateFields and shows the saved value in its section", async () => {
    const updateFields = vi.fn().mockResolvedValue(undefined);
    const current = object("child", "Child");

    const result = await saveDocumentField(
      commandClient(updateFields),
      "workspace",
      current,
      "body",
      "Changed body",
    );
    const before = buildDocumentSections(
      "child",
      [{ sourceId: "child", targetId: "other", depth: 1 }],
      [page(current, object("other", "Other"))],
      types,
    );
    const changed = replaceDocumentField(
      before,
      "child",
      "body",
      "Changed body",
      2,
    );

    expect(updateFields).toHaveBeenCalledWith("workspace", "child", 1, [
      {
        fieldDefCode: "body",
        value: "Changed body",
        expectedFieldVersion: 1,
      },
    ]);
    expect(result).toEqual({ kind: "saved" });
    expect(changed[0]?.fields[1]?.value).toBe("Changed body");
    expect(changed[0]?.object.version).toBe(2);
    expect(changed[1]).toBe(before[1]);
  });

  it("returns KERNEL-409 details for the existing conflict dialog", async () => {
    const failure = new CommandFailure({
      code: "KERNEL-409-VERSION-CONFLICT",
      title: "乐观版本冲突",
      details: {
        currentVersion: 3,
        conflictingFields: [
          {
            fieldDefCode: "body",
            yourValue: "Mine",
            currentValue: "Latest",
            changedBy: "reviewer",
            changedAt: "now",
          },
        ],
      },
    });
    const result = await saveDocumentField(
      commandClient(vi.fn().mockRejectedValue(failure)),
      "workspace",
      object("child", "Child"),
      "body",
      "Mine",
    );

    expect(result.kind).toBe("conflict");
    const fields = result.kind === "conflict" ? result.conflict.fields : [];
    const dialog = ConflictDialog({
      fields,
      onConfirm: () => undefined,
      onClose: () => undefined,
    });
    expect(JSON.stringify(dialog)).toContain("字段已被他人修改");
    expect(JSON.stringify(dialog)).toContain("Latest");
  });

  it("stays readonly without a command client", () => {
    const sections = buildDocumentSections(
      "child",
      [],
      [page(object("child", "Child"))],
      types,
    );

    expect(canInlineEditDocumentField(sections[0]!)).toBe(false);
  });
});

function object(id: string, name: string): ViewObject {
  return {
    objectId: id,
    objectType: "requirement",
    status: "DRAFT",
    version: 1,
    fields: { name, body: `${name} body` },
    updatedAt: "2026-06-14T00:00:00Z",
    ruleStatus: "OK",
  };
}

function terminal(): ViewObject {
  return {
    ...object("terminal", "Terminal"),
    status: "ARCHIVED",
  };
}

function page(...items: readonly ViewObject[]): ObjectPage {
  return {
    items,
    page: 0,
    pageSize: 200,
    total: items.length,
  };
}

function commandClient(
  updateFields = vi.fn().mockResolvedValue(undefined),
): CommandClient {
  return { updateFields } as unknown as CommandClient;
}
