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

  it("reads the template catalog without workspace scope", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify([
            {
              templateId: "template-1",
              code: "interior_design",
              name: "室内设计",
              version: 2,
              latestPublishedVersion: 2,
              publishedAt: "2026-06-22T00:00:00Z",
              description: null,
              typeOverview: [{ code: "room", name: "Room" }],
              typeOverviewTruncated: false,
            },
          ]),
        ),
    );

    const templates = await new ViewClient("/api", fetchFn).templates();

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/views/templates");
    expect(templates[0]?.description).toBeNull();
    expect(templates[0]?.typeOverview[0]?.code).toBe("room");
  });

  it("reads visible workspaces without workspace scope", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify([
            {
              workspaceId: "workspace-1",
              name: "技术方案A",
              templateCode: "interior_design",
              updatedAt: "2026-06-26T00:00:00Z",
            },
          ]),
        ),
    );

    const workspaces = await new ViewClient("/api", fetchFn).workspaces();

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/views/workspaces");
    expect(workspaces[0]?.templateCode).toBe("interior_design");
  });

  it("creates outputs with snapshot scope and actor header", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            outputId: "out-1",
            dataSnapshotId: "snap-1",
            format: "markdown",
            templateId: null,
            templateVersion: null,
            reviewStatus: "UNKNOWN",
            checkStatus: "UNKNOWN",
            dataVersion: 3,
            createdAt: "2026-06-24T00:00:00Z",
            createdBy: "alice",
            contentHash: "hash",
          }),
        ),
    );
    const client = new ViewClient("/api", fetchFn);

    const output = await client.createOutput("ws", "alice", {
      snapshotId: "snap-1",
      format: "markdown",
      objectType: "room",
      fieldOrder: ["name"],
    });

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/workspaces/ws/outputs");
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
      "X-Actor-Id": "alice",
    });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      snapshotId: "snap-1",
      format: "markdown",
      objectType: "room",
      fieldOrder: ["name"],
    });
    expect(output.outputId).toBe("out-1");
  });

  it("gets generated output artifacts", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            meta: {
              outputId: "out-1",
              dataSnapshotId: "snap-1",
              format: "docx",
              templateId: null,
              templateVersion: null,
              reviewStatus: "UNKNOWN",
              checkStatus: "UNKNOWN",
              dataVersion: 3,
              createdAt: "2026-06-24T00:00:00Z",
              createdBy: "alice",
              contentHash: "hash",
            },
            artifact: "UEs=",
          }),
        ),
    );
    const detail = await new ViewClient("/api", fetchFn).getOutput(
      "ws",
      "out-1",
    );

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/workspaces/ws/outputs/out-1");
    expect(detail.artifact).toBe("UEs=");
    expect(detail.meta.format).toBe("docx");
  });

  it("runs a rule check and returns the runId from events", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            commandId: "cmd-1",
            status: "ACCEPTED",
            events: ["run-1"],
          }),
        ),
    );
    const runId = await new ViewClient("/api", fetchFn).runRuleCheck(
      "ws",
      "alice",
      "room",
    );

    expect(runId).toBe("run-1");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/workspaces/ws/rule-commands");
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-Actor-Id": "alice",
    });
    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(body.commandType).toBe("RunRuleCheck");
    expect(body.payload.scope.objectTypeCode).toBe("room");
  });

  it("lists check results for a run", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({ items: [], page: 0, pageSize: 50, total: 0 }),
        ),
    );
    await new ViewClient("/api", fetchFn).checkResults("ws", "run-1");

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/check-results?runId=run-1&page=0&size=50",
    );
  });

  it("posts UpdateFields with expectedFieldVersion", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(null, { status: 200 }),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("alice");

    await client.updateFields("ws", "object", 4, [
      { fieldDefCode: "cost", value: 8, expectedFieldVersion: 4 },
    ]);

    const request = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
      "X-Actor-Id": "alice",
    });
    expect(request.commandType).toBe("UpdateFields");
    expect(request.payload.fields[0].expectedFieldVersion).toBe(4);
  });

  it("does not post commands until an actor id is set", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(null, { status: 200 }),
    );
    const client = new CommandClient("/api", fetchFn);

    await expect(
      client.updateFields("ws", "object", 4, [
        { fieldDefCode: "cost", value: 8, expectedFieldVersion: 4 },
      ]),
    ).rejects.toThrow("缺少 X-Actor-Id");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("posts CreateRelation and Unlink through the command endpoint", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(null, { status: 204 }),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("alice");

    await client.createRelation("ws", "rel", "source", "target");
    await client.unlink("ws", "relation", 3);

    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-Actor-Id": "alice",
    });
    expect(fetchFn.mock.calls[1]?.[1]?.headers).toMatchObject({
      "X-Actor-Id": "alice",
    });
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

    const client = new CommandClient("", fetchFn);
    client.setActorId("alice");
    const failure = await client
      .updateFields("ws", "object", 1, [])
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CommandFailure);
    expect((failure as CommandFailure).message).toBe("乐观版本冲突");
  });
});
