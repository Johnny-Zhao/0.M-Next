import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { FieldDefinition, ObjectType, ViewObject } from "@m-next/views";

import {
  InlineFieldEditor,
  fieldSummaryDerivedEntries,
  fieldSummaryFields,
  fieldSummaryInputReadOnly,
  fieldSummarySelectedClass,
  loadFieldSummaryData,
  saveFieldSummaryField,
} from "./field-summary-panel";

describe("FieldSummaryPanel helpers", () => {
  it("loads all typed objects through bounded per-type view queries", async () => {
    const moduleType = objectType("module", [field("name"), field("power_w")]);
    const systemType = objectType("system", [field("name")]);
    const abstractType = objectType("proposal_node", []);
    const moduleObject = viewObject("module-1", "module", { name: "编排" });
    const systemObject = viewObject("system-1", "system", { name: "主系统" });
    const moduleObject2 = viewObject("module-2", "module", { name: "适配" });
    const objects = vi.fn(
      async (_workspaceId: string, objectTypeCode: string, page: number) => {
        if (objectTypeCode === "module" && page === 0) {
          return {
            items: [moduleObject],
            page,
            pageSize: 200,
            total: 201,
          };
        }
        if (objectTypeCode === "module") {
          return {
            items: [moduleObject2],
            page,
            pageSize: 200,
            total: 201,
          };
        }
        return { items: [systemObject], page, pageSize: 200, total: 1 };
      },
    );

    const result = await loadFieldSummaryData(
      {
        objectTypes: vi
          .fn()
          .mockResolvedValue([moduleType, abstractType, systemType]),
        objects,
      },
      "workspace-1",
    );

    expect(result.types.map((type) => type.code)).toEqual(["system", "module"]);
    expect(result.rows.map((row) => row.object.objectId)).toEqual([
      "system-1",
      "module-1",
      "module-2",
    ]);
    expect(objects).toHaveBeenCalledWith("workspace-1", "system", 0, 200);
    expect(objects).toHaveBeenCalledWith("workspace-1", "module", 0, 200);
    expect(objects).toHaveBeenCalledWith("workspace-1", "module", 1, 200);
  });

  it("keeps editable stored fields out of title/code/body chrome", () => {
    const row = {
      object: viewObject("module-1", "module", {
        name: "编排",
        code: "MOD",
        body: "{}",
        power_w: 120,
        child_count_fx: 2,
      }),
      type: objectType("module", [
        field("name"),
        field("code"),
        field("body"),
        field("power_w", "number"),
        field("child_count_fx", "number"),
      ]),
    };

    expect(fieldSummaryFields(row).map((item) => item.code)).toEqual([
      "power_w",
    ]);
  });

  it("collects derived fx values from derived projection and field fallback", () => {
    const object = viewObject(
      "proposal-1",
      "proposal",
      { total_power_fx: 240, name: "方案" },
      { total_power_fx: 260, child_count_fx: 3 },
    );

    expect(fieldSummaryDerivedEntries(object)).toEqual([
      ["total_power_fx", 260],
      ["child_count_fx", 3],
    ]);
  });

  it("saves inline edits through updateSingleField command semantics", async () => {
    const updateFields = vi.fn().mockResolvedValue(undefined);
    const object = viewObject("module-1", "module", { power_w: 120 });

    const result = await saveFieldSummaryField(
      { updateFields },
      "workspace-1",
      object,
      field("power_w", "number"),
      "180",
    );

    expect(updateFields).toHaveBeenCalledWith("workspace-1", "module-1", 4, [
      { fieldDefCode: "power_w", value: 180 },
    ]);
    expect(result).toMatchObject({
      kind: "saved",
      object: { version: 5, fields: { power_w: 180 } },
    });
  });

  it("allows draft and active fields but makes retired objects read-only", () => {
    expect(
      fieldSummaryInputReadOnly({
        ...viewObject("draft-1", "module", {}),
        status: "DRAFT",
      }),
    ).toBe(false);
    expect(
      fieldSummaryInputReadOnly({
        ...viewObject("active-1", "module", {}),
        status: "ACTIVE",
      }),
    ).toBe(false);
    expect(
      fieldSummaryInputReadOnly({
        ...viewObject("archived-1", "module", {}),
        status: "ARCHIVED",
      }),
    ).toBe(true);
    expect(
      fieldSummaryInputReadOnly({
        ...viewObject("soft-deleted-1", "module", {}),
        status: "SOFT_DELETED",
      }),
    ).toBe(true);
  });

  it("renders draft inputs as editable controlled fields", () => {
    const editableHtml = renderInlineFieldEditor(
      { ...viewObject("draft-1", "module", { power_w: 120 }), status: "DRAFT" },
      field("power_w", "number"),
    );
    const retiredHtml = renderInlineFieldEditor(
      {
        ...viewObject("archived-1", "module", { power_w: 120 }),
        status: "ARCHIVED",
      },
      field("power_w", "number"),
    );

    expect(editableHtml).toContain('value="120"');
    expect(editableHtml).not.toMatch(/readonly|disabled/i);
    expect(retiredHtml).toMatch(/readonly/i);
    expect(retiredHtml).not.toMatch(/disabled/i);
  });

  it("marks only the selected row", () => {
    expect(fieldSummarySelectedClass("object-1", "object-1")).toContain(
      "field-summary-row-selected",
    );
    expect(fieldSummarySelectedClass("object-1", "object-2")).toBe("");
  });
});

function field(code: string, dataType = "string"): FieldDefinition {
  return { code, name: code, dataType, required: false, constraints: {} };
}

function objectType(
  code: string,
  fields: readonly FieldDefinition[],
): ObjectType {
  return { id: `${code}-type`, code, name: code, fields };
}

function viewObject(
  objectId: string,
  objectTypeCode: string,
  fields: Readonly<Record<string, unknown>>,
  derived?: Readonly<Record<string, unknown>>,
): ViewObject {
  return {
    objectId,
    objectType: objectTypeCode,
    status: "ACTIVE",
    version: 4,
    fields,
    derived,
    updatedAt: "2026-07-07T00:00:00Z",
    source: "manual",
    ruleStatus: "OK",
  };
}

function renderInlineFieldEditor(
  object: ViewObject,
  editableField: FieldDefinition,
): string {
  const selection = { select: vi.fn(), subscribe: vi.fn() };
  return renderToStaticMarkup(
    createElement(InlineFieldEditor, {
      object,
      field: editableField,
      readOnly: fieldSummaryInputReadOnly(object),
      selection: selection as never,
      onSave: () => undefined,
    }),
  );
}
