import { describe, expect, it, vi } from "vitest";

import { CommandFailure, type CommandClient } from "../api/command-client";
import type {
  ObjectPage,
  ObjectType,
  ViewClient,
  ViewObject,
} from "../api/view-client";
import { ConflictDialog } from "../conflict/conflict-dialog";
import { SelectionCoordinator } from "../selection/selection-coordinator";
import {
  addModuleEntryState,
  addModuleToProposal,
  ArchiveConfirm,
  archiveDocumentObject,
  buildDocumentSections,
  canEditDocumentField,
  canInlineEditDocumentField,
  documentEmptyMessage,
  handleModuleAdded,
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

  it("explains empty document states without changing tree semantics", () => {
    expect(documentEmptyMessage("", "decomposes_to")).toContain("根对象");
    expect(documentEmptyMessage("root", "adjacent")).toContain("hierarchical");
  });

  it("archives a node through the registered Archive command with its version", async () => {
    const archive = vi.fn().mockResolvedValue(undefined);
    const target = { ...object("module-1", "方案编排"), version: 4 };

    const result = await archiveDocumentObject(
      { archive } as unknown as CommandClient,
      "workspace",
      target,
    );

    expect(archive).toHaveBeenCalledWith("workspace", "object", "module-1", 4);
    expect(result).toEqual({ kind: "archived" });
  });

  it("surfaces a readable message when archiving fails", async () => {
    const archive = vi
      .fn()
      .mockRejectedValue(
        new CommandFailure({ code: "PERM-403", title: "无权归档" }),
      );

    const result = await archiveDocumentObject(
      { archive } as unknown as CommandClient,
      "workspace",
      object("module-1", "方案编排"),
    );

    expect(result).toEqual({ kind: "error", message: "无权归档" });
  });

  it("renders the archive confirmation with the node title and actions", () => {
    const dialog = ArchiveConfirm({
      title: "方案编排",
      busy: false,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    });

    const markup = JSON.stringify(dialog);
    expect(markup).toContain("确认归档");
    expect(markup).toContain("方案编排");
    expect(markup).toContain("解除它与方案的关联");
    expect(markup).toContain("取消");
  });

  it("adds a module: creates it then links it under the proposal", async () => {
    const objectTypes = vi
      .fn()
      .mockResolvedValue([
        { id: "type-module", code: "module", name: "Module", fields: [] },
      ]);
    const objects = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page(moduleObject("mod-1", "供电模块")));
    const createObject = vi.fn().mockResolvedValue(undefined);
    const createRelation = vi.fn().mockResolvedValue(undefined);

    const result = await addModuleToProposal({
      viewClient: { objectTypes, objects } as unknown as Pick<
        ViewClient,
        "objectTypes" | "objects"
      >,
      commandClient: { createObject, createRelation } as unknown as Pick<
        CommandClient,
        "createObject" | "createRelation"
      >,
      workspaceId: "ws",
      proposalId: "proposal-1",
      name: "供电模块",
      relationTypeId: "rel-contains-module",
      delay: () => Promise.resolve(),
    });

    expect(createObject).toHaveBeenCalledWith("ws", "type-module", {
      name: "供电模块",
      power_w: 0,
    });
    expect(createRelation).toHaveBeenCalledWith(
      "ws",
      "rel-contains-module",
      "proposal-1",
      "mod-1",
    );
    expect(result).toEqual({ kind: "added", moduleId: "mod-1" });
  });

  it("reports an unsupported template when there is no module type", async () => {
    const objectTypes = vi
      .fn()
      .mockResolvedValue([
        { id: "type-proposal", code: "proposal", name: "Proposal", fields: [] },
      ]);
    const createObject = vi.fn();
    const createRelation = vi.fn();

    const result = await addModuleToProposal({
      viewClient: { objectTypes, objects: vi.fn() } as unknown as Pick<
        ViewClient,
        "objectTypes" | "objects"
      >,
      commandClient: { createObject, createRelation } as unknown as Pick<
        CommandClient,
        "createObject" | "createRelation"
      >,
      workspaceId: "ws",
      proposalId: "proposal-1",
      name: "供电模块",
      relationTypeId: "rel",
      delay: () => Promise.resolve(),
    });

    expect(result).toEqual({
      kind: "error",
      message: "当前模板不支持添加模块",
    });
    expect(createObject).not.toHaveBeenCalled();
  });

  it("requires a non-empty module name before issuing commands", async () => {
    const createObject = vi.fn();
    const result = await addModuleToProposal({
      viewClient: { objectTypes: vi.fn(), objects: vi.fn() } as unknown as Pick<
        ViewClient,
        "objectTypes" | "objects"
      >,
      commandClient: {
        createObject,
        createRelation: vi.fn(),
      } as unknown as Pick<CommandClient, "createObject" | "createRelation">,
      workspaceId: "ws",
      proposalId: "proposal-1",
      name: "   ",
      relationTypeId: "rel",
    });

    expect(result).toEqual({ kind: "error", message: "请输入模块名称" });
    expect(createObject).not.toHaveBeenCalled();
  });

  it("maps a command failure to a readable message without codes", async () => {
    const objectTypes = vi
      .fn()
      .mockResolvedValue([
        { id: "type-module", code: "module", name: "Module", fields: [] },
      ]);
    const objects = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page(moduleObject("mod-1", "供电模块")));
    const createRelation = vi.fn().mockRejectedValue(
      new CommandFailure({
        code: "KERNEL-410-TARGET-ARCHIVED",
        title: "目标已废止",
      }),
    );

    const result = await addModuleToProposal({
      viewClient: { objectTypes, objects } as unknown as Pick<
        ViewClient,
        "objectTypes" | "objects"
      >,
      commandClient: {
        createObject: vi.fn().mockResolvedValue(undefined),
        createRelation,
      } as unknown as Pick<CommandClient, "createObject" | "createRelation">,
      workspaceId: "ws",
      proposalId: "proposal-1",
      name: "供电模块",
      relationTypeId: "rel",
      delay: () => Promise.resolve(),
    });

    expect(result).toEqual({ kind: "error", message: "目标已废止" });
    const message = result.kind === "error" ? result.message : "";
    expect(message).not.toContain("KERNEL");
  });

  it("returns a soft syncing notice (not an error) when the module can't be read back", async () => {
    const objectTypes = vi
      .fn()
      .mockResolvedValue([
        { id: "type-module", code: "module", name: "Module", fields: [] },
      ]);
    const objects = vi.fn().mockResolvedValue(page());
    const createRelation = vi.fn();

    const result = await addModuleToProposal({
      viewClient: { objectTypes, objects } as unknown as Pick<
        ViewClient,
        "objectTypes" | "objects"
      >,
      commandClient: {
        createObject: vi.fn().mockResolvedValue(undefined),
        createRelation,
      } as unknown as Pick<CommandClient, "createObject" | "createRelation">,
      workspaceId: "ws",
      proposalId: "proposal-1",
      name: "供电模块",
      relationTypeId: "rel",
      attempts: 3,
      delay: () => Promise.resolve(),
    });

    expect(result).toEqual({
      kind: "pending",
      message: "模块已创建，正在同步，稍后会出现在文档树中",
    });
    expect(objects).toHaveBeenCalledTimes(4);
    expect(createRelation).not.toHaveBeenCalled();
  });

  it("disables the add-module entry when the relation type is missing", () => {
    expect(addModuleEntryState(null)).toEqual({
      disabled: true,
      unsupported: true,
    });
    expect(addModuleEntryState(undefined)).toEqual({
      disabled: true,
      unsupported: false,
    });
    expect(addModuleEntryState("rel-1")).toEqual({
      disabled: false,
      unsupported: false,
    });
  });

  it("after adding: refreshes views, reloads the tree, and selects the module", () => {
    const selection = new SelectionCoordinator();
    const reload = vi.fn();
    const onRefresh = vi.fn();

    handleModuleAdded(selection, "mod-1", { reload, onRefresh });

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(selection.current()).toEqual({
      entityType: "object",
      entityId: "mod-1",
    });
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
    source: null,
    ruleStatus: "OK",
  };
}

function moduleObject(id: string, name: string): ViewObject {
  return { ...object(id, name), objectType: "module" };
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
