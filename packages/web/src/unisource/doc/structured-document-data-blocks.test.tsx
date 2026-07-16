import { describe, expect, it } from "vitest";

import type { DataObject, ObjectTypeDef } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  resolveDataReference,
  resolveDataTable,
} from "./structured-document-data-blocks";

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
  });
  it("expands real relations and retains dangling cells", () => {
    const { workspace, root } = fixture();
    const table = resolveDataTable(workspace, root, {
      scope: "document-root",
      objectTypeCode: "item",
      relationTypeCode: "contains",
      columns: [
        { id: "name", fieldCode: "name" },
        { id: "product", fieldCode: "name", relationPath: ["selects"] },
        { id: "missing", fieldCode: "name", relationPath: ["uses"] },
      ],
    });
    expect(table.rows[0]?.cells.map((cell) => cell.text)).toEqual([
      "明细 A",
      "产品 A",
      "引用关系不存在",
    ]);
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
      objectTypes: [type("plan"), type("item"), type("product")],
      objects: [
        object("plan", "plan", "方案 A"),
        object("item", "item", "明细 A"),
        object("product", "product", "产品 A"),
      ],
      relations: [
        relation("contains", "plan", "item"),
        relation("selects", "item", "product"),
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
