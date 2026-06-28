import { describe, expect, it } from "vitest";

import type { AiChangeItem } from "@m-next/views";

import {
  aiChangeSetId,
  aiItemChanges,
  aiVerdictTone,
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

  it("labels values and verdict tones", () => {
    expect(valueText(null)).toBe("空");
    expect(valueText({ a: 1 })).toBe('{"a":1}');
    expect(aiVerdictTone("WRITABLE")).toBe("ok");
    expect(aiVerdictTone("WARN")).toBe("warn");
    expect(aiVerdictTone("BLOCKED")).toBe("block");
  });
});
