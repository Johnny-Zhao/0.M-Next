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
  StructuredDocumentOutline,
  StructuredDocumentFieldEditor,
  structuredDocumentOutlineTargetId,
} from "./structured-document-view";
import type { StructuredDocumentOutlineItem } from "./structured-document-view-model";

describe("structured document field editing", () => {
  afterEach(() => {
    resetToastsForTest();
  });

  it("uses SessionStore.requestWrite with the field object type", async () => {
    const requestWrite = vi.fn(() => ({
      queued: false as const,
      eventId: "event-document-write",
      syncedRefs: 2,
    }));

    const result = await commitStructuredDocumentFieldEdit({
      field: documentField(),
      rawValue: "1099",
      session: { requestWrite },
      waitForLastWrite: async () => ({ state: "synced" as const }),
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

  it("waits for the field write completion and rejects the failed result", async () => {
    const requestWrite = vi.fn(() => ({
      queued: false as const,
      eventId: "event-document-write",
      syncedRefs: 0,
    }));
    let complete!: (value: { state: "failed"; message: string }) => void;
    const completion = new Promise<{ state: "failed"; message: string }>(
      (resolve) => {
        complete = resolve;
      },
    );
    const saved = commitStructuredDocumentFieldEdit({
      field: documentField(),
      rawValue: "1099",
      session: { requestWrite },
      waitForLastWrite: () => completion,
    });

    expect(requestWrite).toHaveBeenCalledTimes(1);
    complete({ state: "failed", message: "乐观版本冲突" });
    await expect(saved).rejects.toThrow("乐观版本冲突");
  });

  it("does not report a field write as saved before kernel sync completes", async () => {
    const requestWrite = vi.fn(() => ({
      queued: false as const,
      eventId: "event-document-write",
      syncedRefs: 0,
    }));
    let complete!: (value: { state: "synced" }) => void;
    const completion = new Promise<{ state: "synced" }>((resolve) => {
      complete = resolve;
    });
    const saved = commitStructuredDocumentFieldEdit({
      field: documentField(),
      rawValue: "1099",
      session: { requestWrite },
      waitForLastWrite: () => completion,
    });
    let settled = false;
    void saved.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    complete({ state: "synced" });
    await expect(saved).resolves.toMatchObject({ kind: "written" });
  });

  it("closes a committed document edit without presenting it as synced", async () => {
    const requestWrite = vi.fn(() => ({
      queued: false as const,
      eventId: "event-document-write",
      syncedRefs: 0,
    }));

    await expect(
      commitStructuredDocumentFieldEdit({
        field: documentField(),
        rawValue: "1099",
        session: { requestWrite },
        waitForLastWrite: async () => ({
          state: "committed-pending" as const,
          message: "写入已提交，派生数据仍在同步；请稍后重新加载工作空间确认。",
        }),
      }),
    ).resolves.toMatchObject({
      kind: "written",
      syncState: "committed-pending",
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

  it("writes permitted edits and queues readonly edits without local mutation", async () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);
    const field = documentField();

    const direct = await commitStructuredDocumentFieldEdit({
      field,
      rawValue: "1099",
      session,
      waitForLastWrite: async () => ({ state: "local" as const }),
    });
    session.switchMember("chenmo");
    const queued = await commitStructuredDocumentFieldEdit({
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

  it("uses only FieldDef enum options and rejects invalid values before writing", async () => {
    const field = enumDocumentField();
    const requestWrite = vi.fn();

    expect(enumOptionsForDocumentField(field)).toEqual(["DRAFT", "PROPOSED"]);
    await expect(
      commitStructuredDocumentFieldEdit({
        field,
        rawValue: "INVALID",
        session: { requestWrite },
      }),
    ).rejects.toThrow("请选择有效枚举值");
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

  it("rejects non-finite numbers and unavailable enum configuration before writing", async () => {
    const requestWrite = vi.fn();

    await expect(
      commitStructuredDocumentFieldEdit({
        field: documentField(),
        rawValue: "not-a-number",
        session: { requestWrite },
      }),
    ).rejects.toThrow();
    await expect(
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
    ).rejects.toThrow("枚举字段配置不可用");
    expect(requestWrite).not.toHaveBeenCalled();
  });

  it("renders the document outline shell with active and unavailable states", () => {
    const items: readonly StructuredDocumentOutlineItem[] = [
      {
        kind: "root",
        id: "root",
        label: "方案",
        objectId: "plan-1",
        state: "ready",
      },
      {
        kind: "section",
        id: "section-items",
        label: "方案明细",
        relationTypeCode: "contains",
        state: "missing",
        message: "引用关系不存在",
      },
    ];
    const html = renderToStaticMarkup(
      createElement(StructuredDocumentOutline, {
        items,
        activeId: "root",
        onSelect: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="文档大纲"');
    expect(html).toContain("方案明细");
    expect(html).toContain("引用关系不存在");
    expect(html).toContain('data-active="true"');
    expect(html).toContain("disabled");
  });

  it("renders an explicit empty outline state", () => {
    const html = renderToStaticMarkup(
      createElement(StructuredDocumentOutline, {
        items: [],
        activeId: null,
        onSelect: () => undefined,
      }),
    );
    expect(html).toContain("暂无章节");
  });

  it("targets chapters without selecting the root and targets rows by object", () => {
    const section: StructuredDocumentOutlineItem = {
      kind: "section",
      id: "section-items",
      label: "方案明细",
      relationTypeCode: "contains",
      state: "ready",
      message: null,
    };
    const row: StructuredDocumentOutlineItem = {
      kind: "row",
      id: "row-1",
      label: "明细",
      objectId: "item-1",
      relationId: "rel-1",
      sectionId: section.id,
      state: "ready",
      message: null,
    };

    expect(structuredDocumentOutlineTargetId(section)).toBe(
      "structured-document-section-contains",
    );
    expect(structuredDocumentOutlineTargetId(row)).toBe(
      "document-object-item-1",
    );
  });

  it("keeps the root visible while reporting that no sections are loaded", () => {
    const html = renderToStaticMarkup(
      createElement(StructuredDocumentOutline, {
        items: [
          {
            kind: "root",
            id: "root",
            label: "方案",
            objectId: "plan-1",
            state: "ready",
          },
        ],
        activeId: "root",
        onSelect: () => undefined,
      }),
    );
    expect(html).toContain("方案");
    expect(html).toContain("暂无章节");
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
