import { describe, expect, it, vi } from "vitest";

import type { CommandClient } from "./command-client";
import { updateSingleField } from "./update-single-field";
import type { ViewObject } from "./view-client";

const object: ViewObject = {
  objectId: "module-1",
  objectType: "module",
  status: "DRAFT",
  version: 5,
  fields: { power_w: 0 },
  updatedAt: "2026-07-05T00:00:00Z",
  source: "manual",
  ruleStatus: "OK",
};

function client(updateFields = vi.fn().mockResolvedValue(undefined)) {
  return { updateFields } as unknown as Pick<CommandClient, "updateFields">;
}

describe("updateSingleField", () => {
  it("submits a number field as a number", async () => {
    const updateFields = vi.fn().mockResolvedValue(undefined);

    const result = await updateSingleField(client(updateFields), {
      workspaceId: "ws",
      object,
      fieldCode: "power_w",
      raw: "50",
      dataType: "number",
    });

    expect(result).toEqual({ kind: "saved", value: 50 });
    expect(updateFields).toHaveBeenCalledWith("ws", "module-1", 5, [
      { fieldDefCode: "power_w", value: 50 },
    ]);
  });

  it("locks by object version only — never sends expectedFieldVersion", async () => {
    const updateFields = vi.fn().mockResolvedValue(undefined);

    await updateSingleField(client(updateFields), {
      workspaceId: "ws",
      object,
      fieldCode: "power_w",
      raw: "50",
      dataType: "number",
    });

    const fields = updateFields.mock.calls[0]?.[3] as readonly unknown[];
    expect(fields).toEqual([{ fieldDefCode: "power_w", value: 50 }]);
    expect(fields[0]).not.toHaveProperty("expectedFieldVersion");
  });

  it("uses expectedObjectVersion override for the optimistic lock (409 retry)", async () => {
    const updateFields = vi.fn().mockResolvedValue(undefined);

    await updateSingleField(client(updateFields), {
      workspaceId: "ws",
      object,
      fieldCode: "power_w",
      raw: "50",
      dataType: "number",
      expectedObjectVersion: 9,
    });

    expect(updateFields).toHaveBeenCalledWith("ws", "module-1", 9, [
      { fieldDefCode: "power_w", value: 50 },
    ]);
  });

  it("blocks a non-numeric value without submitting", async () => {
    const updateFields = vi.fn();

    const result = await updateSingleField(client(updateFields), {
      workspaceId: "ws",
      object,
      fieldCode: "power_w",
      raw: "abc",
      dataType: "number",
    });

    expect(result).toEqual({ kind: "invalid", message: "请输入数字" });
    expect(updateFields).not.toHaveBeenCalled();
  });

  it("passes non-numeric fields through unchanged", async () => {
    const updateFields = vi.fn().mockResolvedValue(undefined);
    const named: ViewObject = { ...object, fields: { name: "旧值" } };

    const result = await updateSingleField(client(updateFields), {
      workspaceId: "ws",
      object: named,
      fieldCode: "name",
      raw: "新值",
      dataType: "string",
    });

    expect(result).toEqual({ kind: "saved", value: "新值" });
    expect(updateFields).toHaveBeenCalledWith("ws", "module-1", 5, [
      { fieldDefCode: "name", value: "新值" },
    ]);
  });
});
