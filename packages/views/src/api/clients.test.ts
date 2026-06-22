import { describe, expect, it, vi } from "vitest";

import { CommandClient, CommandFailure } from "./command-client";
import { ViewClient, type FetchFn } from "./view-client";

describe("view and command clients", () => {
  it("scopes paged object reads and caps page size", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                objectId: "obj-1",
                objectType: "demo_object",
                status: "DRAFT",
                version: 1,
                fields: {},
                updatedAt: "2026-06-21T00:00:00Z",
                source: "manual",
                ruleStatus: "WARN",
              },
            ],
          }),
        ),
    );
    const client = new ViewClient("/api", fetchFn);

    const page = await client.objects("ws", "demo_object", 2, 200);

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/objects?objectType=demo_object&page=2&pageSize=200",
    );
    expect(page.items[0]?.ruleStatus).toBe("WARN");
    expect(page.items[0]?.source).toBe("manual");
    expect(() => client.objects("ws", "demo_object", 0, 201)).toThrow();
  });

  it("reads bounded rule statuses in batch", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify([{ objectId: "obj-1", ruleStatus: "BLOCK" }]),
        ),
    );
    const client = new ViewClient("/api", fetchFn);

    const statuses = await client.ruleStatus("ws", ["obj-1", "obj-2"]);

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/rule-status?objectIds=obj-1&objectIds=obj-2",
    );
    expect(statuses[0]?.ruleStatus).toBe("BLOCK");
    expect(() =>
      client.ruleStatus(
        "ws",
        Array.from({ length: 201 }, (_, index) => `obj-${index}`),
      ),
    ).toThrow();
  });

  it("bounds relation depth and scopes tree reads", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(JSON.stringify([])),
    );
    const client = new ViewClient("/api", fetchFn);
    await client.relations("ws", "depends_on", "out", "root", 9);
    await client.tree("ws", "decomposes_to", "root");

    expect(fetchFn.mock.calls[0]?.[0]).toContain("depth=5");
    expect(fetchFn.mock.calls[1]?.[0]).toContain(
      "relationType=decomposes_to&rootId=root",
    );
  });

  it("reads lineage with encoded object and field scope", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            objectId: "obj-1",
            fieldCode: "total_load",
            upstream: [],
            algorithm: { kind: "derived", ref: "derived-1" },
            downstream: [],
            partial: false,
            truncated: false,
          }),
        ),
    );
    const lineage = await new ViewClient("/api", fetchFn).lineage(
      "ws",
      "obj-1",
      "total load",
    );

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/lineage?objectId=obj-1&fieldCode=total+load",
    );
    expect(lineage.algorithm.kind).toBe("derived");
  });

  it("posts UpdateFields with expectedFieldVersion", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(null, { status: 200 }),
    );
    const client = new CommandClient("/api", fetchFn);

    await client.updateFields("ws", "object", 4, [
      { fieldDefCode: "cost", value: 8, expectedFieldVersion: 4 },
    ]);

    const request = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(request.commandType).toBe("UpdateFields");
    expect(request.payload.fields[0].expectedFieldVersion).toBe(4);
  });

  it("posts CreateRelation and Unlink through the command endpoint", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(null, { status: 204 }),
    );
    const client = new CommandClient("/api", fetchFn);

    await client.createRelation("ws", "rel", "source", "target");
    await client.unlink("ws", "relation", 3);

    const create = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    const unlink = JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body));
    expect(create.commandType).toBe("CreateRelation");
    expect(create.payload).toMatchObject({
      relationTypeId: "rel",
      sourceId: "source",
      targetId: "target",
    });
    expect(unlink.commandType).toBe("Unlink");
    expect(unlink.payload).toMatchObject({
      relationId: "relation",
      expectedVersion: 3,
      acknowledgeImpact: true,
    });
  });
});

describe("command errors", () => {
  it("maps conflict codes to business titles", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            code: "KERNEL-409-VERSION-CONFLICT",
            details: { conflictingFields: [{ fieldDefCode: "cost" }] },
          }),
          { status: 409 },
        ),
    );

    const failure = await new CommandClient("", fetchFn)
      .updateFields("ws", "object", 1, [])
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CommandFailure);
    expect((failure as CommandFailure).message).toBe("乐观版本冲突");
  });
});
