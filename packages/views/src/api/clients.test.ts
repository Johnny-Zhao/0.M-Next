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
              tags: {
                industry: ["建筑装饰"],
                profession: ["室内设计"],
                scenario: ["户型评估"],
              },
              typeOverview: [{ code: "room", name: "Room" }],
              typeOverviewTruncated: false,
            },
          ]),
        ),
    );

    const templates = await new ViewClient("/api", fetchFn).templates();

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/views/templates");
    expect(templates[0]?.description).toBeNull();
    expect(templates[0]?.tags.industry).toEqual(["建筑装饰"]);
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

  it("reads mapping profile definitions for a workspace", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify([
            {
              code: "req_to_case",
              name: "Requirement to Case",
              correspondenceRelationCode: "verifies",
              sourceProfile: "source_profile",
              targetProfile: "target_profile",
              sourceTypeCode: "requirement",
              targetTypeCode: "test_case",
              objectMappings: [
                {
                  sourceTypeCode: "requirement",
                  targetTypeCode: "test_case",
                  cardinality: "one_to_one",
                  direction: "source_to_target",
                  fieldMappings: [
                    { targetFieldCode: "name", expression: "field('text')" },
                  ],
                },
              ],
              relationMappings: [],
            },
          ]),
        ),
    );

    const mappings = await new ViewClient("/api", fetchFn).mappingProfiles(
      "ws",
    );

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/mapping-profiles",
    );
    expect(mappings[0]?.objectMappings[0]?.cardinality).toBe("one_to_one");
  });

  it("reads reusable assemblies with optional profile scope", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                assemblyId: "assembly-1",
                name: "Battery Pack",
                templateVersionId: "template-version-1",
                templateCode: "reuse_profile",
                templateVersion: 1,
                version: 2,
                params: { name: "Battery Pack" },
                objectTypes: ["component"],
                createdAt: "2026-06-29T00:00:00Z",
              },
            ],
            page: 0,
            pageSize: 100,
            total: 1,
          }),
        ),
    );

    const page = await new ViewClient("/api", fetchFn).reusableAssemblies(
      "ws",
      "reuse_profile",
    );

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/reusable-assemblies?page=0&size=100&profile=reuse_profile",
    );
    expect(page.items[0]?.objectTypes).toEqual(["component"]);
    expect(() =>
      new ViewClient("/api", fetchFn).reusableAssemblies("ws", null, 0, 101),
    ).toThrow();
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

  it("reads simulation runs and bounded downsampled series", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({ items: [], page: 0, pageSize: 20, total: 0 }),
        ),
    );
    const client = new ViewClient("/api", fetchFn);

    await client.simRuns("ws");
    await client.simSeries("ws", "run-1", {
      object: "object-1",
      field: "temperature",
      from: 0,
      to: 120,
      downsample: 8,
      page: 1,
      size: 100,
    });

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/sim-runs?page=0&size=20",
    );
    expect(fetchFn.mock.calls[1]?.[0]).toBe(
      "/api/workspaces/ws/views/sim-runs/run-1/series?downsample=8&page=1&size=100&object=object-1&field=temperature&from=0&to=120",
    );
    expect(() => client.simRuns("ws", 0, 51)).toThrow();
    expect(() =>
      client.simSeries("ws", "run-1", { size: 501, downsample: 1 }),
    ).toThrow();
    expect(() =>
      client.simSeries("ws", "run-1", { size: 1, downsample: 1001 }),
    ).toThrow();
  });

  it("reads mapping correspondences and bounded coverage pages", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({ items: [], page: 0, pageSize: 30, total: 0 }),
        ),
    );
    const client = new ViewClient("/api", fetchFn);

    await client.mappingCorrespondences("ws");
    await client.mappingCoverage("ws", "corr-1", 2, 30);

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/mapping/correspondences",
    );
    expect(fetchFn.mock.calls[1]?.[0]).toBe(
      "/api/workspaces/ws/views/mapping/correspondences/corr-1/coverage?page=2&size=30",
    );
    expect(() => client.mappingCoverage("ws", "corr-1", 0, 51)).toThrow();
  });

  it("reads bounded verification coverage pages", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            verified: 1,
            unverified: 2,
            failed: 3,
            total: 6,
            gaps: { items: [], page: 1, pageSize: 20, total: 5 },
          }),
        ),
    );
    const client = new ViewClient("/api", fetchFn);

    const coverage = await client.verificationCoverage("ws", 1, 20);

    expect(coverage.failed).toBe(3);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/verification-coverage?page=1&size=20",
    );
    expect(() => client.verificationCoverage("ws", 0, 101)).toThrow();
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

  it("places reusable assemblies through the assembly command endpoint", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            commandId: "cmd-1",
            status: "COMMITTED",
            events: [],
          }),
        ),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("alice");

    await client.placeAssembly("ws", "assembly-1", 2, {
      placementKey: "slot-a",
      params: { name: "Battery A" },
    });

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/assembly-commands",
    );
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
      "X-Actor-Id": "alice",
    });
    const request = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(request.commandType).toBe("PlaceAssembly");
    expect(request.payload).toMatchObject({
      assemblyId: "assembly-1",
      version: 2,
      placementKey: "slot-a",
      params: { name: "Battery A" },
    });
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
      source: { type: "manual", ref: "matrix" },
    });
    expect(unlink.commandType).toBe("Unlink");
    expect(unlink.payload).toMatchObject({
      relationId: "relation",
      expectedVersion: 3,
      acknowledgeImpact: true,
    });
  });

  it("posts CreateObject with resolved object type id and manual source", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            commandId: "cmd-1",
            status: "COMMITTED",
            events: [],
          }),
        ),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("alice");

    await client.createObject("ws", "type-proposal", {
      title: "我的第一个方案",
      version: "v1",
      author: "alice",
      power_budget_w: 500,
    });

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/workspaces/ws/commands");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
      "X-Actor-Id": "alice",
    });
    const request = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(request.commandType).toBe("CreateObject");
    expect(request.payload).toMatchObject({
      objectTypeId: "type-proposal",
      fields: {
        title: "我的第一个方案",
        version: "v1",
        author: "alice",
        power_budget_w: 500,
      },
      source: { type: "manual", ref: "authoring" },
    });
    expect(request.payload.initialState).toBeUndefined();
  });

  it("posts Archive with object version optimistic lock through the command endpoint", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(null, { status: 204 }),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("alice");

    await client.archive("ws", "object", "module-1", 3);

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/workspaces/ws/commands");
    const request = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(request.commandType).toBe("Archive");
    expect(request.payload).toMatchObject({
      targetType: "object",
      targetId: "module-1",
      reason: "authoring-archive",
      expectedVersion: 3,
      relationPolicy: "unlink",
    });
  });

  it("instantiates against the author workspace with the new id in the payload", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(null, { status: 200 }),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("alice");

    await client.instantiateWorkspace("ws-new", "tpl-1", 2, "测试方案");

    const author = "a0000000-0000-4000-8000-000000000000";
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      `/api/workspaces/${author}/meta-commands`,
    );
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
      "X-Actor-Id": "alice",
    });
    const request = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(request.commandType).toBe("InstantiateWorkspace");
    expect(request.workspaceId).toBe(author);
    expect(request.payload).toMatchObject({
      templateId: "tpl-1",
      version: 2,
      newWorkspaceId: "ws-new",
      workspaceName: "测试方案",
    });
  });

  it("posts AI proposal commands to the governed AI endpoint", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(JSON.stringify({ events: ["set-1"] })),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("actor-1");

    const result = await client.proposeAiChange("ws", {
      action: "SUGGEST_FIELDS",
      selection: { objectIds: ["obj-1"], checkResultIds: [] },
      instruction: "补齐字段",
    });

    expect(result.events?.[0]).toBe("set-1");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/workspaces/ws/ai-commands");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
      "X-Actor-Id": "actor-1",
    });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      commandType: "ProposeAiChange",
      workspaceId: "ws",
      payload: {
        action: "SUGGEST_FIELDS",
        selection: { objectIds: ["obj-1"], checkResultIds: [] },
        instruction: "补齐字段",
      },
    });
  });

  it("reads AI change sets with actor-scoped view access", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify([
            {
              setId: "set-1",
              action: "SUGGEST_FIELDS",
              status: "PROPOSED",
              provider: "stub",
              providerVersion: "1a",
              contextHash: "hash",
              resultText: null,
              createdAt: "2026-06-28T00:00:00Z",
              applied: 0,
              skipped: 0,
              items: [],
            },
          ]),
        ),
    );

    const sets = await new ViewClient("/api", fetchFn).aiChanges(
      "ws",
      "actor",
      {
        status: "PROPOSED",
      },
    );

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/ai-changes?status=PROPOSED",
    );
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-Actor-Id": "actor",
    });
    expect(sets[0]?.provider).toBe("stub");
  });

  it("posts review annotation commands with the controller payload", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            id: "ann-1",
            workspaceId: "ws",
            roundId: null,
            targetType: "field",
            targetId: "obj-1",
            fieldCode: "name",
            anchoredDataVersion: 3,
            severity: "issue",
            body: "检查命名",
            status: "open",
            createdBy: "actor",
            createdAt: "2026-06-28T00:00:00Z",
            resolvedBy: null,
            resolvedAt: null,
          }),
        ),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("actor");

    await client.createAnnotation("ws", {
      targetType: "field",
      targetId: "obj-1",
      fieldCode: "name",
      anchoredDataVersion: 3,
      severity: "issue",
      body: "检查命名",
    });

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/review/commands",
    );
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      commandType: "CreateAnnotation",
      workspaceId: "ws",
      payload: {
        targetType: "field",
        targetId: "obj-1",
        fieldCode: "name",
        anchoredDataVersion: 3,
        severity: "issue",
        body: "检查命名",
        roundId: null,
      },
    });
  });

  it("queries annotations by target and optional field", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () => new Response(JSON.stringify([])),
    );

    await new ViewClient("/api", fetchFn).annotations(
      "ws",
      "field",
      "obj-1",
      "name",
    );

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/annotations?targetType=field&targetId=obj-1&fieldCode=name",
    );
  });

  it("previews exchange payloads as raw text", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            objects: { added: ["new"], removed: [], changed: [] },
            relations: { added: [], removed: [], changed: [] },
            summary: {
              objectsAdded: 1,
              objectsRemoved: 0,
              objectsChanged: 0,
              relationsAdded: 0,
              relationsRemoved: 0,
              relationsChanged: 0,
            },
          }),
        ),
    );

    const diff = await new ViewClient("/api", fetchFn).exchangePreview(
      "ws",
      "json",
      '{"objects":[]}',
    );

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/exchange/json/preview?base=current",
    );
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: '{"objects":[]}',
    });
    expect(diff.summary.objectsAdded).toBe(1);
  });

  it("exports exchange payloads as downloadable text", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response("<REQ-IF />", {
          headers: { "content-type": "application/xml" },
        }),
    );

    const exported = await new ViewClient("/api", fetchFn).exchangeExport(
      "ws",
      "reqif",
      "requirement",
    );

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/exchange/reqif/export?base=current&objectType=requirement",
    );
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      accept: "application/xml",
    });
    expect(exported.payload).toBe("<REQ-IF />");
    expect(exported.contentType).toBe("application/xml");
  });

  it("lists and reads snapshots with actor-scoped view access", async () => {
    const fetchFn = vi.fn<FetchFn>(async (input) => {
      if (String(input).endsWith("/snapshots?page=0&size=25")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                snapshotId: "snap-1",
                createdAt: "2026-06-28T00:00:00Z",
                createdBy: "actor",
                dataVersion: 7,
                contentHash: "hash",
                scopeObjectType: "room",
              },
            ],
            page: 0,
            pageSize: 25,
            total: 1,
          }),
        );
      }
      return new Response(
        JSON.stringify({
          meta: {
            snapshotId: "snap-1",
            createdAt: "2026-06-28T00:00:00Z",
            createdBy: "actor",
            dataVersion: 7,
            contentHash: "hash",
            scopeObjectType: "room",
          },
          payload: { objects: [], relations: [] },
        }),
      );
    });
    const client = new ViewClient("/api", fetchFn);

    const page = await client.listSnapshots("ws", "actor", 0, 25);
    const detail = await client.getSnapshot("ws", "actor", "snap-1");

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/snapshots?page=0&size=25",
    );
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-Actor-Id": "actor",
    });
    expect(fetchFn.mock.calls[1]?.[0]).toBe(
      "/api/workspaces/ws/snapshots/snap-1",
    );
    expect(page.items[0]?.snapshotId).toBe("snap-1");
    expect(detail.payload.objects).toEqual([]);
  });

  it("serializes tree snapshot scope without object scope", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            snapshotId: "snap-tree",
            createdAt: "2026-06-28T00:00:00Z",
            createdBy: "actor",
            dataVersion: 8,
            contentHash: "hash-tree",
            scopeObjectType: null,
          }),
        ),
    );
    const client = new ViewClient("/api", fetchFn);

    await client.captureSnapshot("ws", "actor", "module", {
      rootId: "proposal-1",
      relationType: "proposal_contains_module",
    });

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/workspaces/ws/snapshots");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-Actor-Id": "actor",
    });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      treeScope: {
        rootId: "proposal-1",
        relationType: "proposal_contains_module",
        maxDepth: 5,
      },
    });
  });

  it("posts diff requests with controller DataSet payloads", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            objects: { added: [], removed: [], changed: [] },
            relations: { added: [], removed: [], changed: [] },
            summary: {
              objectsAdded: 0,
              objectsRemoved: 0,
              objectsChanged: 0,
              relationsAdded: 0,
              relationsRemoved: 0,
              relationsChanged: 0,
            },
          }),
        ),
    );
    const dataSet = { objects: [], relations: [] };

    await new ViewClient("/api", fetchFn).diff("ws", {
      base: "current",
      other: dataSet,
    });

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/workspaces/ws/diff");
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      base: "current",
      other: dataSet,
    });
  });

  it("applies JSON exchange artifacts with actor governance", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            diff: {
              objects: { added: [], removed: [], changed: [] },
              relations: { added: [], removed: [], changed: [] },
              summary: {
                objectsAdded: 0,
                objectsRemoved: 0,
                objectsChanged: 0,
                relationsAdded: 0,
                relationsRemoved: 0,
                relationsChanged: 0,
              },
            },
            applied: ["object:new"],
            unapplied: [],
          }),
        ),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("actor");

    const result = await client.exchangeApply(
      "ws",
      "json",
      '{"version":1,"objects":[]}',
    );

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/exchange/json/apply",
    );
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
      "X-Actor-Id": "actor",
    });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      artifact: { version: 1, objects: [] },
      confirmRemovals: false,
    });
    expect(result.applied).toEqual(["object:new"]);
  });

  it("applies ReqIF exchange payloads with the controller request shape", async () => {
    const fetchFn = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            diff: {
              objects: { added: [], removed: [], changed: [] },
              relations: { added: [], removed: [], changed: [] },
              summary: {
                objectsAdded: 0,
                objectsRemoved: 0,
                objectsChanged: 0,
                relationsAdded: 0,
                relationsRemoved: 0,
                relationsChanged: 0,
              },
            },
            applied: [],
            unapplied: [],
          }),
        ),
    );
    const client = new CommandClient("/api", fetchFn);
    client.setActorId("actor");

    await client.exchangeApply("ws", "reqif", "<REQ-IF />");

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      reqif: "<REQ-IF />",
      confirmRemovals: false,
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
