import { describe, expect, it } from "vitest";

import type { ObjectTypeDef, RelationType } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "../state/changeset-store";
import { SessionStore } from "../state/session-store";
import {
  WorkspaceStore,
  type ObjectCreateDescriptor,
  type WriteSink,
} from "../state/workspace-store";
import {
  createRecord,
  createRecordAvailability,
  creatableFields,
  updateRecord,
  validateCreateRecord,
} from "./create-record-action";

describe("create record action", () => {
  it("derives only writable fields and validates required, enum and number inputs", () => {
    expect(creatableFields(objectType).map((field) => field.code)).toEqual([
      "code",
      "name",
      "amount",
      "status",
      "enabled",
    ]);
    const result = validateCreateRecord(objectType, {
      code: "",
      name: "采购",
      amount: "NaN",
      status: "unexpected",
      enabled: true,
    });

    expect(result.fields).toEqual({ name: "采购", enabled: true });
    expect(result.errors).toMatchObject({
      code: "编码为必填项",
      amount: "金额必须是有效数字",
      status: "状态不是合法选项",
    });
    const unavailable = validateCreateRecord(
      {
        ...objectType,
        fields: objectType.fields.map((field) =>
          field.code === "status" ? { ...field, enumValues: [] } : field,
        ),
      },
      validDraft(),
    );
    expect(unavailable.errors.status).toBe("状态配置不可用");
  });

  it("does not create local objects for invalid fields or insufficient permission", async () => {
    const invalid = harness();
    const invalidResult = await createRecord({
      objectType,
      relationTypes: [],
      draft: {
        code: "",
        name: "采购",
        amount: "1",
        status: "DRAFT",
        enabled: false,
      },
      workspace: invalid.workspace,
      session: invalid.session,
    });
    expect(invalidResult.state).toBe("invalid");
    expect(invalid.sink.calls).toHaveLength(0);

    const denied = harness();
    denied.session.switchMember("zhouran");
    const deniedResult = await createRecord({
      objectType,
      relationTypes: [],
      draft: validDraft(),
      workspace: denied.workspace,
      session: denied.session,
    });
    expect(deniedResult.state).toBe("permission-denied");
    expect(denied.sink.calls).toHaveLength(0);
  });

  it("requires quantity fields to be positive integers", () => {
    const quantityType: ObjectTypeDef = {
      ...objectType,
      fields: objectType.fields.map((field) =>
        field.code === "amount" ? { ...field, code: "quantity" } : field,
      ),
    };
    const validation = validateCreateRecord(quantityType, {
      code: "ITEM-1",
      name: "明细",
      quantity: "1.5",
      status: "DRAFT",
      enabled: true,
    });
    expect(validation.errors.quantity).toContain("大于 0 的整数");
  });

  it("creates through the WorkspaceStore and returns the reconciled object id", async () => {
    const test = harness({ objectId: "kernel-supplier-1" });
    const result = await createRecord({
      objectType,
      relationTypes: [],
      draft: validDraft(),
      workspace: test.workspace,
      session: test.session,
    });

    expect(result).toEqual({ state: "created", objectId: "kernel-supplier-1" });
    expect(test.sink.calls[0]?.params).toMatchObject({
      objectTypeCode: "supplier",
      fields: {
        code: "SUP-NEW",
        name: "新供应商",
        amount: 10,
        status: "DRAFT",
        enabled: true,
      },
    });
    expect(test.workspace.getObject("kernel-supplier-1")).toBeDefined();
  });

  it("keeps failed creation out of workspace state", async () => {
    const test = harness({ failure: "内核写入失败" });
    const result = await createRecord({
      objectType,
      relationTypes: [],
      draft: validDraft(),
      workspace: test.workspace,
      session: test.session,
    });
    expect(result).toEqual({ state: "failed", message: "内核写入失败" });
    expect(
      test.workspace
        .getSnapshot()
        .objects.some((item) => item.fields.code?.value === "SUP-NEW"),
    ).toBe(false);
  });

  it("rejects a duplicate code in the current workspace before creating", async () => {
    const test = harness();
    test.workspace.createObject({
      objectTypeCode: "supplier",
      fields: { code: "SUP-NEW", name: "已有供应商" },
      actor: "wangyun",
    });
    const result = await createRecord({
      objectType,
      relationTypes: [],
      draft: validDraft(),
      workspace: test.workspace,
      session: test.session,
    });
    expect(result).toEqual({
      state: "invalid",
      errors: { code: "编码已存在，请使用其他编码" },
    });
    expect(test.sink.calls).toHaveLength(1);
  });

  it("updates changed writable fields through the session write path", async () => {
    const test = harness();
    const created = test.workspace.createObject({
      objectTypeCode: "supplier",
      fields: {
        code: "SUP-OLD",
        name: "旧供应商",
        amount: 10,
        status: "DRAFT",
        enabled: true,
      },
      actor: "wangyun",
    });
    const result = await updateRecord({
      objectType,
      object: created,
      draft: {
        code: "SUP-OLD",
        name: "新供应商",
        amount: "20",
        status: "DRAFT",
        enabled: true,
      },
      workspace: test.workspace,
      session: test.session,
    });

    expect(result).toEqual({ state: "updated", changed: 2, queued: 0 });
    expect(test.workspace.getObject(created.id)?.fields.name?.value).toBe(
      "新供应商",
    );
    expect(test.workspace.getObject(created.id)?.fields.amount?.value).toBe(20);
  });

  it("queues each changed field when the member lacks edit permission", async () => {
    const test = harness();
    const created = test.workspace.createObject({
      objectTypeCode: "supplier",
      fields: {
        code: "SUP-OLD",
        name: "旧供应商",
        amount: 10,
        status: "DRAFT",
        enabled: true,
      },
      actor: "wangyun",
    });
    test.session.switchMember("zhouran");

    const result = await updateRecord({
      objectType,
      object: created,
      draft: {
        code: "SUP-OLD",
        name: "待审批供应商",
        amount: "10",
        status: "DRAFT",
        enabled: true,
      },
      workspace: test.workspace,
      session: test.session,
    });

    expect(result).toEqual({ state: "updated", changed: 1, queued: 1 });
    expect(test.workspace.getObject(created.id)?.fields.name?.value).toBe(
      "旧供应商",
    );
  });

  it("rejects negative quantity and price-like numbers before writing", async () => {
    const test = harness();
    const result = await createRecord({
      objectType,
      relationTypes: [],
      draft: { ...validDraft(), amount: "-1" },
      workspace: test.workspace,
      session: test.session,
    });
    expect(result.state).toBe("invalid");
    expect(test.sink.calls).toHaveLength(0);
  });

  it("does not update a terminal record", async () => {
    const test = harness();
    const created = test.workspace.createObject({
      objectTypeCode: "supplier",
      fields: { code: "SUP-OLD", name: "旧供应商", amount: 10 },
      actor: "wangyun",
    });
    const terminal = { ...created, status: "archived" as const };
    test.sink.calls.splice(0);
    await expect(
      updateRecord({
        objectType,
        object: terminal,
        draft: { ...validDraft(), code: "SUP-OLD", name: "新供应商" },
        workspace: test.workspace,
        session: test.session,
      }),
    ).resolves.toMatchObject({ state: "failed" });
    expect(test.sink.calls).toHaveLength(0);
  });

  it("keeps update failures visible instead of reporting success", async () => {
    const test = harness();
    const created = test.workspace.createObject({
      objectTypeCode: "supplier",
      fields: {
        code: "SUP-OLD",
        name: "旧供应商",
        amount: 10,
        status: "DRAFT",
        enabled: true,
      },
      actor: "wangyun",
    });
    test.sink.failUpdates = true;
    const result = await updateRecord({
      objectType,
      object: created,
      draft: { ...validDraft(), code: "SUP-OLD", name: "新供应商" },
      workspace: test.workspace,
      session: test.session,
    });
    expect(result).toMatchObject({ state: "failed", message: "后端拒绝" });
  });

  it("hides generic creation for a hierarchical child without naming a domain", () => {
    const child: ObjectTypeDef = { ...objectType, code: "child_record" };
    const relationTypes: readonly RelationType[] = [
      {
        code: "parent_contains_child",
        name: "包含",
        sourceTypeCode: "parent_record",
        targetTypeCode: "child_record",
        hierarchical: true,
      },
    ];

    expect(createRecordAvailability(child, relationTypes)).toEqual({
      available: false,
      reason: "该记录需在其所属对象中创建，以保证关系完整。",
    });
  });
});

const objectType: ObjectTypeDef = {
  code: "supplier",
  name: "供应商",
  group: "test",
  fields: [
    { code: "code", name: "编码", dataType: "text", required: true },
    { code: "name", name: "名称", dataType: "text", required: true },
    { code: "amount", name: "金额", dataType: "number" },
    {
      code: "status",
      name: "状态",
      dataType: "enum",
      enumValues: ["DRAFT", "ACTIVE"],
    },
    { code: "enabled", name: "启用", dataType: "boolean" },
    { code: "total_fx", name: "总计", dataType: "number", computed: true },
    { code: "secret", name: "密级", dataType: "text", readOnly: true },
  ],
};

function validDraft() {
  return {
    code: "SUP-NEW",
    name: "新供应商",
    amount: "10",
    status: "DRAFT",
    enabled: true,
  };
}

function harness(
  options: { readonly objectId?: string; readonly failure?: string } = {},
) {
  const seed = cloneDemoSeed();
  const workspace = new WorkspaceStore({
    ...seed,
    permissions: {
      ...seed.permissions,
      wangyun: { ...seed.permissions.wangyun, supplier: "edit" },
    },
  });
  const session = new SessionStore(
    workspace,
    new ChangeSetStore(seed, workspace),
  );
  const sink = new CreateSink(workspace, options);
  workspace.setWriteSink(sink);
  return { workspace, session, sink };
}

class CreateSink implements WriteSink {
  readonly calls: ObjectCreateDescriptor[] = [];
  failUpdates = false;

  constructor(
    private readonly workspace: WorkspaceStore,
    private readonly options: {
      readonly objectId?: string;
      readonly failure?: string;
    },
  ) {}

  updateField() {
    return this.failUpdates
      ? Promise.resolve({
          state: "failed" as const,
          message: "后端拒绝",
        })
      : Promise.resolve({ state: "synced" as const });
  }

  createObject(descriptor: ObjectCreateDescriptor) {
    this.calls.push(descriptor);
    if (this.options.failure) {
      this.workspace.removeObject(descriptor.temporaryObjectId);
      return Promise.resolve({
        state: "failed" as const,
        message: this.options.failure,
      });
    }
    const objectId = this.options.objectId ?? descriptor.temporaryObjectId;
    this.workspace.reconcileObjectId(descriptor.temporaryObjectId, {
      ...descriptor.object,
      id: objectId,
    });
    return Promise.resolve({ state: "synced" as const, objectId });
  }

  createRelation(): void {}

  unlinkRelation(): void {}

  deleteObject(): void {}
}
