import { describe, expect, it, vi } from "vitest";

import type { AiChangeItem, FetchFn } from "@m-next/views";

import {
  aiChangeSetId,
  aiItemChanges,
  aiVerdictTone,
  extractDraft,
  valueText,
} from "./ai-panel";

describe("ai-panel", () => {
  it("extracts the proposed change set id from command events", () => {
    expect(aiChangeSetId({ events: ["set-1"] })).toBe("set-1");
    expect(aiChangeSetId({ events: [] })).toBeNull();
  });

  it("maps UpdateFields items into readable field diffs", () => {
    const item: AiChangeItem = {
      itemId: "item-1",
      seq: 1,
      opType: "UpdateFields",
      payload: {
        objectId: "obj-1",
        fields: [{ fieldDefCode: "priority", value: "HIGH" }],
      },
      precheck: { verdict: "WRITABLE" },
      itemStatus: "PROPOSED",
    };

    const changes = aiItemChanges(
      item,
      new Map([
        [
          "obj-1",
          { objectId: "obj-1", label: "需求A", fields: { priority: "LOW" } },
        ],
      ]),
    );

    expect(changes[0]).toMatchObject({
      objectId: "obj-1",
      fieldCode: "priority",
      before: "LOW",
      after: "HIGH",
      verdict: "WRITABLE",
    });
  });

  it("maps CreateObject items into module proposals", () => {
    const item: AiChangeItem = {
      itemId: "item-2",
      seq: 1,
      opType: "CreateObject",
      payload: {
        objectTypeCode: "module",
        fields: {
          name: "编排模块",
          power_w: 200,
          responsibility: "任务调度",
        },
      },
      precheck: { verdict: "WRITABLE" },
      itemStatus: "PROPOSED",
    };

    const changes = aiItemChanges(item, new Map());

    expect(changes[0]).toMatchObject({
      objectId: "",
      fieldCode: "CreateObject",
      label: "编排模块",
      actionLabel: "建议创建模块",
      summary: "200W · 任务调度",
      verdict: "WRITABLE",
    });
  });

  it("posts draft extraction to the project AI endpoint", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(JSON.stringify({ setId: "set-1" })),
    );
    const commandClient = {
      actorId: "actor-1",
      baseUrl: "/api",
      fetchFn,
    };

    const setId = await extractDraft(commandClient, "workspace-1", "系统草稿");

    expect(setId).toBe("set-1");
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/workspace-1/ai/extract",
    );
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
      "X-Actor-Id": "actor-1",
    });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      draft: "系统草稿",
    });
  });

  it("surfaces draft extraction failures", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "草稿中没有可抽取的模块" } }),
          { status: 422 },
        ),
    );

    await expect(
      extractDraft({ actorId: "actor-1", baseUrl: "", fetchFn }, "ws", "草稿"),
    ).rejects.toThrow("草稿中没有可抽取的模块");
  });

  it("labels values and verdict tones", () => {
    expect(valueText(null)).toBe("空");
    expect(valueText({ a: 1 })).toBe('{"a":1}');
    expect(aiVerdictTone("WRITABLE")).toBe("ok");
    expect(aiVerdictTone("WARN")).toBe("warn");
    expect(aiVerdictTone("BLOCKED")).toBe("block");
  });
});
