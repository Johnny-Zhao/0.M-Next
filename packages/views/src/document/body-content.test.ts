import { getSchema } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

import { CommandClient } from "../api/command-client";
import { bodyExtensions, parseBody, serializeBody } from "./body-content";
import { saveDocumentField } from "./document-view";

const richDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "供电模块" },
        { type: "text", text: " 负责配电。" },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "冗余供电" }],
            },
          ],
        },
      ],
    },
  ],
};

describe("body-content", () => {
  it("restricts the schema to paragraph/bold/italic/bulletList — filters headings and other extensions", () => {
    const schema = getSchema(bodyExtensions());

    expect(Object.keys(schema.nodes).sort()).toEqual([
      "bulletList",
      "doc",
      "listItem",
      "paragraph",
      "text",
    ]);
    expect(Object.keys(schema.marks).sort()).toEqual(["bold", "italic"]);
    // 子集外内容不在 schema 中 → 粘贴时被 ProseMirror 按 schema 过滤。
    expect(schema.nodes.heading).toBeUndefined();
    expect(schema.nodes.orderedList).toBeUndefined();
    expect(schema.marks.strike).toBeUndefined();
    expect(schema.marks.link).toBeUndefined();
  });

  it("serializes editor JSON to a string, and saving routes a string through updateSingleField", async () => {
    const payload = serializeBody(richDoc);
    expect(typeof payload).toBe("string");
    expect(JSON.parse(payload)).toEqual(richDoc);

    const updateFields = vi.fn().mockResolvedValue(undefined);
    const result = await saveDocumentField(
      { updateFields } as unknown as CommandClient,
      "workspace",
      object("module-1"),
      "body",
      payload,
      "string",
    );

    expect(result).toEqual({ kind: "saved", value: payload });
    const sent = updateFields.mock.calls[0]?.[3] as ReadonlyArray<{
      readonly fieldDefCode: string;
      readonly value: unknown;
    }>;
    expect(sent[0]?.fieldDefCode).toBe("body");
    expect(typeof sent[0]?.value).toBe("string");
    expect(sent[0]?.value).toBe(payload);
  });

  it("treats empty / whitespace / empty-doc body as the placeholder (empty) state", () => {
    expect(parseBody(undefined).kind).toBe("empty");
    expect(parseBody("").kind).toBe("empty");
    expect(parseBody("   ").kind).toBe("empty");
    expect(
      parseBody('{"type":"doc","content":[{"type":"paragraph"}]}').kind,
    ).toBe("empty");
  });

  it("degrades broken JSON (and non-doc JSON) to read-only plain text", () => {
    expect(parseBody("not json {")).toEqual({
      kind: "invalid",
      text: "not json {",
    });
    expect(parseBody('{"foo":1}')).toEqual({
      kind: "invalid",
      text: '{"foo":1}',
    });
  });

  it("parses a valid rich doc for rendering/editing", () => {
    const result = parseBody(serializeBody(richDoc));
    expect(result.kind).toBe("doc");
  });
});

function object(id: string) {
  return {
    objectId: id,
    objectType: "module",
    status: "DRAFT",
    version: 1,
    fields: { name: "供电模块" },
    updatedAt: "2026-07-06T00:00:00Z",
    source: "manual",
    ruleStatus: "OK" as const,
  };
}
