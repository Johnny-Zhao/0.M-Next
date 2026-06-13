import { describe, expect, it, vi } from "vitest";

import { CommandClient, CommandFailure } from "./command-client";
import { ViewClient } from "./view-client";

describe("view and command clients", () => {
  it("scopes paged object reads and caps page size", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ items: [] })));
    const client = new ViewClient("/api", fetchFn);

    await client.objects("ws", "demo_object", 2, 200);

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/ws/views/objects?objectType=demo_object&page=2&pageSize=200",
    );
    expect(() => client.objects("ws", "demo_object", 0, 201)).toThrow();
  });

  it("posts UpdateFields with expectedFieldVersion", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const client = new CommandClient("/api", fetchFn);

    await client.updateFields("ws", "object", 4, [
      { fieldDefCode: "cost", value: 8, expectedFieldVersion: 4 },
    ]);

    const request = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(request.commandType).toBe("UpdateFields");
    expect(request.payload.fields[0].expectedFieldVersion).toBe(4);
  });
});

describe("command errors", () => {
  it("maps conflict codes to business titles", async () => {
    const fetchFn = vi.fn(
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
