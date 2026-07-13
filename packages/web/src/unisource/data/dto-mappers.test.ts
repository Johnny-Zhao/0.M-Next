import { describe, expect, it } from "vitest";

import type { ObjectTypeDef } from "../model/kernel";
import {
  mapAiChangeSet,
  mapAnnotation,
  mapCommandError,
  mapCheckResult,
  mapHistoryEntry,
  mapObjectType,
  mapOutputDetail,
  mapOutputMeta,
  mapSnapshotMeta,
  mapViewObject,
} from "./dto-mappers";

const productType: ObjectTypeDef = {
  code: "product_specs",
  name: "Product specs",
  group: "Products",
  fields: [
    { code: "name", name: "Name", dataType: "text" },
    { code: "price", name: "Price", dataType: "number" },
  ],
};

describe("dto mappers", () => {
  it("maps ViewObject fields into DataObject field values", () => {
    const object = mapViewObject(
      {
        objectId: "prod-s3",
        objectType: "product_specs",
        status: "ACTIVE",
        version: 7,
        fields: { name: "Door lock S3", price: 1199 },
        derived: { total: 1199 },
        updatedAt: "2026-07-10T10:24:00+08:00",
        source: "AI",
        ruleStatus: "BLOCK",
      } as const,
      productType,
    );

    expect(object).toMatchObject({
      id: "prod-s3",
      objectTypeCode: "product_specs",
      status: "active",
      version: 7,
      updatedBy: "ai",
    });
    expect(object.fields.name).toMatchObject({
      value: "Door lock S3",
      fieldVersion: 7,
      updatedBy: "ai",
      source: "ai",
    });
    expect(object.fields.price?.value).toBe(1199);
  });

  it("keeps empty ViewObject fields empty and falls back to active/manual", () => {
    const object = mapViewObject(
      {
        objectId: "obj-empty",
        objectType: "unknown",
        status: "UNKNOWN",
        version: 1,
        fields: {},
        updatedAt: "2026-07-10T10:24:00+08:00",
        source: null,
        ruleStatus: "UNKNOWN",
      } as const,
      productType,
    );

    expect(object.status).toBe("active");
    expect(object.updatedBy).toBe("wangyun");
    expect(object.fields).toEqual({});
  });

  it("maps ObjectType fields and downgrades unknown data types to text", () => {
    const mapped = mapObjectType({
      id: "type-uuid",
      code: "contracts",
      name: "Contracts",
      fields: [
        {
          code: "amount",
          name: "Amount",
          dataType: "decimal",
          required: true,
          constraints: { unit: "CNY" },
        },
        {
          code: "payload",
          name: "Payload",
          dataType: "json",
          required: false,
          constraints: {},
        },
        {
          code: "status",
          name: "Status",
          dataType: "select",
          required: false,
          constraints: { enumValues: ["draft", "active"] },
        },
      ],
    } as const);

    expect(mapped.kernelId).toBe("type-uuid");
    expect(mapped.fields.map((field) => field.dataType)).toEqual([
      "number",
      "text",
      "enum",
    ]);
    expect(mapped.fields[0]?.unit).toBe("CNY");
    expect(mapped.fields[2]?.enumValues).toEqual(["draft", "active"]);
  });

  it("maps edit history entries with inverse field values", () => {
    const event = mapHistoryEntry({
      eventId: "evt-edit-price",
      seq: 3,
      kind: "edit",
      fieldCode: "price",
      before: 1299,
      after: 1199,
      actorKind: "user",
      actorId: "ai",
      actorDisplay: "AI",
      source: "ai",
      objectVersion: 2,
      correlationId: "prod-s3",
      occurredAt: "2026-07-10T10:24:00+08:00",
    } as const);

    expect(event.target).toEqual({
      entityType: "field",
      entityId: "prod-s3",
      fieldCode: "price",
    });
    expect(event.actor).toBe("ai");
    expect(event.viaAi).toBe(true);
    expect(event.inverse).toEqual({
      objectId: "prod-s3",
      fieldCode: "price",
      value: 1299,
    });
  });

  it("maps relation history entries without inventing an inverse", () => {
    const event = mapHistoryEntry({
      eventId: "evt-link",
      seq: 4,
      kind: "link",
      fieldCode: null,
      before: null,
      after: { relationId: "rel-s3-g2" },
      actorKind: "user",
      actorId: "lixiao",
      actorDisplay: "Li Xiao",
      source: "manual",
      objectVersion: 1,
      correlationId: null,
      occurredAt: "2026-07-10T10:24:00+08:00",
    } as const);

    expect(event.target).toEqual({
      entityType: "relation",
      entityId: "rel-s3-g2",
    });
    expect(event.inverse).toBeNull();
  });

  it("maps check result severities and treats unknown severity as warning", () => {
    const block = mapCheckResult({
      runId: "run-1",
      ruleCode: "XSRC-001",
      severity: "BLOCK",
      message: "Mismatch",
      objectId: "sales-offline-dealer",
      fieldCode: "cached_price",
      configHash: "hash",
      createdAt: "2026-07-10T10:24:00+08:00",
    });
    const unknown = mapCheckResult({
      runId: "run-1",
      ruleCode: "CUSTOM",
      severity: "CUSTOM",
      message: "Custom severity",
      objectId: "prod-s3",
      fieldCode: null,
      configHash: "hash",
      createdAt: "2026-07-10T10:24:00+08:00",
    });

    expect(block.level).toBe("error");
    expect(block.target).toEqual({
      entityType: "field",
      entityId: "sales-offline-dealer",
      fieldCode: "cached_price",
    });
    expect(unknown.level).toBe("warning");
    expect(unknown.target).toEqual({
      entityType: "object",
      entityId: "prod-s3",
    });
  });

  it("maps command errors into local write rejections", () => {
    const rejection = mapCommandError({
      code: "KERNEL-409-VERSION-CONFLICT",
      title: "乐观版本冲突",
      details: {
        currentVersion: 7,
        conflictingFields: [
          {
            fieldDefCode: "price",
            yourValue: 1099,
            currentValue: 1199,
            changedBy: "lixiao",
            changedAt: "2026-07-10T10:40:00+08:00",
          },
        ],
      },
    });

    expect(rejection).toEqual({
      code: "KERNEL-409-VERSION-CONFLICT",
      title: "乐观版本冲突",
      currentVersion: 7,
      conflictingFields: [
        {
          fieldCode: "price",
          currentValue: 1199,
          changedBy: "lixiao",
          changedAt: "2026-07-10T10:40:00+08:00",
        },
      ],
    });
  });

  it("maps kernel AI change sets into local overlay change sets", () => {
    const changeSet = mapAiChangeSet({
      setId: "ai-set-1",
      action: "SUGGEST_FIELDS",
      status: "PROPOSED",
      provider: "kernel",
      providerVersion: "v1",
      contextHash: "hash",
      resultText: null,
      createdAt: "2026-07-10T10:24:00+08:00",
      applied: 1,
      skipped: 0,
      items: [
        {
          itemId: "ai-item-1",
          seq: 1,
          opType: "UPDATE_FIELD",
          payload: {
            objectId: "prod-s3",
            fieldCode: "price",
            before: 1299,
            after: 1199,
          },
          precheck: {},
          itemStatus: "PROPOSED",
        },
        {
          itemId: "ai-item-2",
          seq: 2,
          opType: "CREATE_OBJECT",
          payload: {
            id: "prod-new",
            objectTypeCode: "product_specs",
            fields: { name: "新品", price: 899 },
          },
          precheck: {},
          itemStatus: "APPLIED",
        },
      ],
    });

    expect(changeSet).toMatchObject({
      id: "ai-set-1",
      source: "ai",
      status: "pending",
      actor: "ai",
      items: [
        {
          id: "ai-item-1",
          op: "updateField",
          target: {
            entityType: "field",
            entityId: "prod-s3",
            fieldCode: "price",
          },
          oldValue: 1299,
          nextValue: 1199,
          applied: false,
        },
        {
          id: "ai-item-2",
          op: "createObject",
          target: { entityType: "object", entityId: "prod-new" },
          objectTypeCode: "product_specs",
          fields: { name: "新品", price: 899 },
          applied: true,
        },
      ],
    });
  });

  it("maps kernel review annotations into local anchored comments", () => {
    const annotation = mapAnnotation({
      id: "ann-1",
      workspaceId: "ws",
      roundId: null,
      targetType: "field",
      targetId: "kernel-prod-s3",
      fieldCode: "price",
      anchoredDataVersion: 7,
      severity: "BLOCK",
      body: "价格需要复核",
      status: "resolved",
      createdBy: "lixiao",
      createdAt: "2026-07-10T10:24:00+08:00",
      resolvedBy: "wangyun",
      resolvedAt: "2026-07-10T10:32:00+08:00",
    });

    expect(annotation).toEqual({
      id: "ann-1",
      anchor: {
        entityType: "field",
        entityId: "kernel-prod-s3",
        fieldCode: "price",
      },
      body: "价格需要复核",
      author: "lixiao",
      at: "2026-07-10T10:24:00+08:00",
      resolved: true,
      severity: "block",
      anchoredDataVersion: 7,
      resolvedBy: "wangyun",
      resolvedAt: "2026-07-10T10:32:00+08:00",
    });
  });

  it("maps snapshot and output DTOs into local output artifacts", () => {
    expect(
      mapSnapshotMeta({
        snapshotId: "snapshot-1",
        createdAt: "2026-07-10T10:24:00+08:00",
        createdBy: "wangyun",
        dataVersion: 9,
        contentHash: "hash-snapshot",
        scopeObjectType: "hardware_products",
      }),
    ).toEqual({
      snapshotId: "snapshot-1",
      createdAt: "2026-07-10T10:24:00+08:00",
      createdBy: "wangyun",
      dataVersion: 9,
      contentHash: "hash-snapshot",
      scopeObjectType: "hardware_products",
    });

    const meta = {
      outputId: "output-1",
      dataSnapshotId: "snapshot-1",
      format: "docx" as const,
      templateId: "tpl-install-v1",
      templateVersion: 1,
      reviewStatus: "READY",
      checkStatus: "OK",
      dataVersion: 9,
      createdAt: "2026-07-10T10:25:00+08:00",
      createdBy: "wangyun",
      contentHash: "hash-output",
    };

    expect(mapOutputMeta(meta)).toEqual({
      outputId: "output-1",
      snapshotId: "snapshot-1",
      format: "docx",
      createdAt: "2026-07-10T10:25:00+08:00",
      createdBy: "wangyun",
      contentHash: "hash-output",
    });
    expect(mapOutputDetail({ meta, artifact: "YmFzZTY0" })).toEqual({
      outputId: "output-1",
      snapshotId: "snapshot-1",
      format: "docx",
      artifact: "YmFzZTY0",
      createdAt: "2026-07-10T10:25:00+08:00",
      createdBy: "wangyun",
      contentHash: "hash-output",
    });
  });
});
