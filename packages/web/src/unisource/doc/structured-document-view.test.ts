import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { StructuredDocumentFieldVm } from "./structured-document-view-model";
import { resetToastsForTest } from "../primitives/toast/toast-store";
import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "../state/changeset-store";
import { SessionStore } from "../state/session-store";
import { WorkspaceStore } from "../state/workspace-store";
import {
  commitStructuredDocumentBodyEdit,
  commitStructuredDocumentFieldEdit,
  enumOptionsForDocumentField,
  StructuredDocumentFieldEditor,
} from "./structured-document-view";

describe("structured document field editing", () => {
  afterEach(() => {
    resetToastsForTest();
  });

  it("uses SessionStore.requestWrite with the field object type", () => {
    const requestWrite = vi.fn(() => ({
      queued: false as const,
      eventId: "event-document-write",
      syncedRefs: 2,
    }));

    const result = commitStructuredDocumentFieldEdit({
      field: documentField(),
      rawValue: "1099",
      session: { requestWrite },
    });

    expect(result).toEqual({
      kind: "written",
      eventId: "event-document-write",
      refs: 2,
    });
    expect(requestWrite).toHaveBeenCalledWith({
      resourceCode: "product_specs",
      objectId: "prod-s3",
      fieldCode: "price",
      value: 1099,
    });
  });

  it("saves body through SessionStore with the real object type and waits for sync", async () => {
    const requestWrite = vi.fn(() => ({
      queued: false as const,
      eventId: "event-body-write",
      syncedRefs: 0,
    }));
    const result = await commitStructuredDocumentBodyEdit({
      body: documentBodyField(),
      json: '{"type":"doc","content":[]}',
      session: { requestWrite },
      waitForLastWrite: async () => ({ state: "synced" as const }),
    });

    expect(result).toEqual({
      kind: "written",
      eventId: "event-body-write",
      refs: 0,
    });
    expect(requestWrite).toHaveBeenCalledWith({
      resourceCode: "build_plan",
      objectId: "plan-real-id",
      fieldCode: "body",
      value: '{"type":"doc","content":[]}',
    });
  });

  it("keeps body edits in approval flow when the member lacks permission", async () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);
    session.switchMember("chenmo");

    const result = await commitStructuredDocumentBodyEdit({
      body: documentBodyField(),
      json: '{"type":"doc","content":[]}',
      session,
      waitForLastWrite: async () => ({ state: "local" as const }),
    });

    expect(result.kind).toBe("queued");
    expect(workspace.getObject("plan-real-id")).toBeUndefined();
    expect(changes.getPending()[0]?.items[0]?.target.fieldCode).toBe("body");
  });

  it("writes permitted edits and queues readonly edits without local mutation", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);
    const field = documentField();

    const direct = commitStructuredDocumentFieldEdit({
      field,
      rawValue: "1099",
      session,
    });
    session.switchMember("chenmo");
    const queued = commitStructuredDocumentFieldEdit({
      field,
      rawValue: "999",
      session,
    });

    expect(direct.kind).toBe("written");
    expect(queued.kind).toBe("queued");
    expect(workspace.getObject("prod-s3")?.fields.price?.value).toBe(1099);
    expect(changes.getPending()[0]).toMatchObject({
      actor: "chenmo",
      items: [expect.objectContaining({ nextValue: 999 })],
    });
  });

  it("uses only FieldDef enum options and rejects invalid values before writing", () => {
    const field = enumDocumentField();
    const requestWrite = vi.fn();

    expect(enumOptionsForDocumentField(field)).toEqual(["DRAFT", "PROPOSED"]);
    expect(() =>
      commitStructuredDocumentFieldEdit({
        field,
        rawValue: "INVALID",
        session: { requestWrite },
      }),
    ).toThrow("请选择有效枚举值");
    expect(requestWrite).not.toHaveBeenCalled();
  });

  it("renders enum editing as a select with only configured options", () => {
    const html = renderToStaticMarkup(
      createElement(StructuredDocumentFieldEditor, {
        draft: "DRAFT",
        field: enumDocumentField(),
        onDraftChange: () => undefined,
      }),
    );

    expect(html).toContain("<select");
    expect(html).toContain('value="DRAFT"');
    expect(html).toContain('value="PROPOSED"');
    expect(html).not.toContain("INVALID");
  });

  it("rejects non-finite numbers and unavailable enum configuration before writing", () => {
    const requestWrite = vi.fn();

    expect(() =>
      commitStructuredDocumentFieldEdit({
        field: documentField(),
        rawValue: "not-a-number",
        session: { requestWrite },
      }),
    ).toThrow();
    expect(() =>
      commitStructuredDocumentFieldEdit({
        field: {
          ...enumDocumentField(),
          editable: false,
          editMessage: "枚举字段配置不可用",
          field: { code: "status", name: "状态", dataType: "enum" },
        },
        rawValue: "DRAFT",
        session: { requestWrite },
      }),
    ).toThrow("枚举字段配置不可用");
    expect(requestWrite).not.toHaveBeenCalled();
  });
});

function documentField(): StructuredDocumentFieldVm {
  return {
    objectId: "prod-s3",
    objectTypeCode: "product_specs",
    objectVersion: 1,
    fieldCode: "price",
    fieldName: "价格",
    field: { code: "price", name: "价格", dataType: "number" },
    value: 999,
    valueText: "999",
    state: "fresh",
    editable: true,
    editMessage: null,
  };
}

function documentBodyField(): StructuredDocumentFieldVm {
  return {
    objectId: "plan-real-id",
    objectTypeCode: "build_plan",
    objectVersion: 7,
    fieldCode: "body",
    fieldName: "正文",
    field: { code: "body", name: "正文", dataType: "text" },
    value: '{"type":"doc"}',
    valueText: '{"type":"doc"}',
    state: "fresh",
    editable: true,
    editMessage: null,
  };
}

function enumDocumentField(): StructuredDocumentFieldVm {
  return {
    ...documentField(),
    objectTypeCode: "build_plan",
    fieldCode: "status",
    fieldName: "状态",
    field: {
      code: "status",
      name: "状态",
      dataType: "enum",
      enumValues: ["DRAFT", "PROPOSED"],
    },
    value: "DRAFT",
    valueText: "DRAFT",
  };
}
