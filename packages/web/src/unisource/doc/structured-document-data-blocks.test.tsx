import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DataObject, ObjectTypeDef } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { selectionStore } from "../state/selection-store";
import { WorkspaceStore } from "../state/workspace-store";
import {
  resolveDataReference,
  resolveDataTable,
  selectDataTableRow,
  StructuredDocumentDataBlockActions,
  StructuredDocumentDataBlock,
  validDataReferenceFieldCode,
} from "./structured-document-data-blocks";
import {
  structuredDocumentFieldKey,
  structuredDocumentReferenceDomId,
} from "./structured-document-view-model";

describe("structured document data blocks", () => {
  it("reads a referenced Workspace field without persisting its value", () => {
    const { workspace, root } = fixture();
    expect(
      resolveDataReference(workspace, root, {
        objectBinding: "document-root",
        fieldCode: "name",
      }).field,
    ).toMatchObject({ value: "方案 A", editable: true });
  });
  it("renders a stable data-reference identity and selected highlight", () => {
    const { workspace, root } = fixture();
    selectionStore.set({
      entityType: "field",
      entityId: "plan",
      fieldCode: "name",
    });
    const html = renderToStaticMarkup(
      createElement(StructuredDocumentDataBlock, {
        block: {
          kind: "dataReference",
          config: { objectBinding: "document-root", fieldCode: "name" },
        },
        root,
        workspace,
        onSave: async () => undefined,
      }),
    );

    expect(html).toContain(
      `id="${structuredDocumentReferenceDomId("plan", "name")}"`,
    );
    expect(html).toContain(
      `data-structured-document-reference="${structuredDocumentFieldKey("plan", "name")}"`,
    );
    expect(html).toContain('data-selected="true"');
    selectionStore.clear();
  });
  it("clears a field code that does not belong to the selected object", () => {
    expect(
      validDataReferenceFieldCode(
        [{ code: "name", name: "名称", dataType: "text" }],
        "missing",
      ),
    ).toBe("name");
    expect(validDataReferenceFieldCode([], "name")).toBe("");
  });
  it("keeps missing objects and fields diagnosable", () => {
    const { workspace, root } = fixture();
    expect(
      resolveDataReference(workspace, root, {
        objectId: "missing",
        fieldCode: "name",
      }).message,
    ).toBe("引用对象不存在");
    expect(
      resolveDataReference(workspace, root, {
        objectBinding: "document-root",
        fieldCode: "missing",
      }).message,
    ).toBe("字段引用已失效");
    expect(
      resolveDataReference(workspace, root, {
        objectBinding: "document-root",
        objectTypeCode: "other",
        fieldCode: "name",
      }).message,
    ).toBe("引用对象类型不匹配");
  });
  it("does not make a dangling reference targetable by SelectionRef", () => {
    const { workspace, root } = fixture();
    const html = renderToStaticMarkup(
      createElement(StructuredDocumentDataBlock, {
        block: {
          kind: "dataReference",
          config: { objectId: "missing", fieldCode: "name" },
        },
        root,
        workspace,
        onSave: async () => undefined,
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).not.toContain("data-structured-document-reference=");
  });

  it("keeps terminal objects and missing relations diagnosable", () => {
    const { workspace, root } = fixture();
    workspace.objects[0] = { ...workspace.objects[0]!, status: "archived" };
    expect(
      resolveDataReference(workspace, root, {
        objectBinding: "document-root",
        fieldCode: "name",
      }).message,
    ).toBe("引用对象已处于终态");

    workspace.objects[0] = { ...workspace.objects[0]!, status: "active" };
    expect(
      resolveDataReference(workspace, root, {
        objectId: "product",
        fieldCode: "name",
        relationTypeCode: "unlinked",
      }).message,
    ).toBe("引用关系不存在");
  });
  it("resolves one- and two-hop relation columns from the row object", () => {
    const { workspace, root } = fixture();
    const table = resolveDataTable(workspace, root, {
      scope: "document-root",
      objectTypeCode: "item",
      relationTypeCode: "contains",
      columns: [
        { id: "name", fieldCode: "name" },
        { id: "product", fieldCode: "name", relationPath: ["selects"] },
        {
          id: "supplier",
          fieldCode: "name",
          relationPath: ["uses", "offeredBy"],
        },
      ],
    });
    expect(table.rows[0]?.cells.map((cell) => cell.text)).toEqual([
      "明细 A",
      "产品 A",
      "供应商 A",
    ]);
    expect(table.rows[0]?.cells.slice(1).map((cell) => cell.objectId)).toEqual([
      "product",
      "supplier",
    ]);
  });
  it("marks missing, terminal, and invalid relation columns as dangling", () => {
    const { workspace, root } = fixture();
    const cells = (config: Record<string, unknown>) =>
      resolveDataTable(workspace, root, {
        scope: "document-root",
        objectTypeCode: "item",
        relationTypeCode: "contains",
        columns: [{ id: "value", fieldCode: "name", ...config }],
      }).rows[0]?.cells[0];

    expect(cells({ relationPath: ["missing"] })).toMatchObject({
      text: "—",
      state: "dangling",
    });
    workspace.objects[2] = { ...workspace.objects[2]!, status: "archived" };
    expect(cells({ relationPath: ["selects"] })).toMatchObject({
      text: "—",
      state: "dangling",
    });
    expect(
      cells({ fieldCode: "missing", relationPath: ["uses", "offeredBy"] }),
    ).toMatchObject({
      text: "—",
      state: "dangling",
    });
    expect(
      cells({ relationPath: ["uses", "offeredBy", "too-deep"] }),
    ).toMatchObject({
      text: "—",
      state: "dangling",
    });
  });
  it("keeps flat columns and caps document-root table rows", () => {
    const { workspace, root } = fixture();
    workspace.objects.push(object("item-2", "item", "明细 B"));
    workspace.relations.push(relation("contains", "plan", "item-2"));
    const table = resolveDataTable(workspace, root, {
      scope: "document-root",
      objectTypeCode: "item",
      relationTypeCode: "contains",
      maxRows: 1,
      columns: [{ id: "name", fieldCode: "name" }],
    });
    expect(table).toMatchObject({ maxRows: 1, truncated: true });
    expect(table.rows[0]?.cells[0]).toMatchObject({
      text: "明细 A",
      state: "fresh",
    });
  });
  it("publishes row selection without issuing a write request", () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    selectionStore.clear();
    try {
      selectDataTableRow("item", true);
      expect(selectionStore.getSnapshot().current).toEqual({
        entityType: "object",
        entityId: "item",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it("renders disabled block movement controls when the selected block is at a boundary", () => {
    const { workspace, root } = fixture();
    const actions: Parameters<
      typeof StructuredDocumentDataBlockActions
    >[0]["actions"] = {
      selectedBlock: {
        kind: "dataTable",
        config: { objectTypeCode: "item", columns: [] },
      },
      canMoveSelectedBlockUp: false,
      canMoveSelectedBlockDown: false,
      insertDataReference: vi.fn(),
      insertDataTable: vi.fn(),
      replaceSelectedBlock: vi.fn(),
      removeSelectedBlock: vi.fn(),
      moveSelectedBlockUp: vi.fn(),
      moveSelectedBlockDown: vi.fn(),
    };
    const html = renderToStaticMarkup(
      createElement(StructuredDocumentDataBlockActions, {
        actions,
        config: {
          root: { objectTypeCode: "plan", fields: [], editableFields: [] },
          sections: [],
          dataReferenceTemplates: [],
          dataTableTemplates: [],
        },
        root,
        workspace,
      }),
    );

    expect(html).toContain("上移");
    expect(html).toContain("下移");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

function fixture() {
  const base = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
  const root = {
    objectId: "plan",
    objectTypeCode: "plan",
    label: "方案 A",
    code: "PLAN-A",
    fields: [],
  };
  return {
    root,
    workspace: {
      ...base,
      objectTypes: [
        type("plan"),
        type("item"),
        type("product"),
        type("quote"),
        type("supplier"),
      ],
      objects: [
        object("plan", "plan", "方案 A"),
        object("item", "item", "明细 A"),
        object("product", "product", "产品 A"),
        object("quote", "quote", "报价 A"),
        object("supplier", "supplier", "供应商 A"),
      ],
      relations: [
        relation("contains", "plan", "item"),
        relation("selects", "item", "product"),
        relation("uses", "item", "quote"),
        relation("offeredBy", "quote", "supplier"),
      ],
    },
  };
}
function type(code: string): ObjectTypeDef {
  return {
    code,
    name: code,
    group: "test",
    fields: [{ code: "name", name: "名称", dataType: "text" }],
  };
}
function object(id: string, objectTypeCode: string, name: string): DataObject {
  return {
    id,
    objectTypeCode,
    status: "active",
    version: 1,
    fields: {
      name: {
        value: name,
        fieldVersion: 1,
        updatedBy: "wangyun",
        updatedAt: "2026-01-01",
        source: "manual",
      },
    },
    createdBy: "wangyun",
    createdAt: "2026-01-01",
    updatedBy: "wangyun",
    updatedAt: "2026-01-01",
  };
}
function relation(
  relationTypeCode: string,
  sourceId: string,
  targetId: string,
) {
  return {
    id: `${relationTypeCode}-${sourceId}`,
    relationTypeCode,
    sourceId,
    targetId,
    status: "active" as const,
    fields: {},
    version: 1,
    annotationIds: [],
  };
}
