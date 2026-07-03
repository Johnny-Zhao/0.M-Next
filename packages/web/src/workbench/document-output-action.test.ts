import { describe, expect, it, vi } from "vitest";

import { filename, generateDocumentOutput } from "./document-output-action";

describe("document output action", () => {
  it("captures a snapshot, creates output and returns the artifact", async () => {
    const viewClient = outputClient();

    const detail = await generateDocumentOutput({
      actorId: "alice",
      format: "markdown",
      objectType: "room",
      viewClient,
      workspaceId: "workspace-1",
    });

    expect(viewClient.captureSnapshot).toHaveBeenCalledWith(
      "workspace-1",
      "alice",
      "room",
    );
    expect(viewClient.createOutput).toHaveBeenCalledWith(
      "workspace-1",
      "alice",
      {
        snapshotId: "snap-1",
        format: "markdown",
        objectType: "room",
      },
    );
    expect(viewClient.getOutput).toHaveBeenCalledWith("workspace-1", "out-1");
    expect(detail.artifact).toBe("IyBPdXRwdXQ=");
  });

  it("passes null object scope for whole-workspace output", async () => {
    const viewClient = outputClient();

    await generateDocumentOutput({
      actorId: "alice",
      format: "pdf",
      objectType: " ",
      viewClient,
      workspaceId: "workspace-1",
    });

    expect(viewClient.captureSnapshot).toHaveBeenCalledWith(
      "workspace-1",
      "alice",
      null,
    );
    expect(viewClient.createOutput).toHaveBeenCalledWith(
      "workspace-1",
      "alice",
      expect.objectContaining({ format: "pdf", objectType: null }),
    );
  });

  it("captures a tree snapshot when a root object is available", async () => {
    const viewClient = outputClient();

    await generateDocumentOutput({
      actorId: "alice",
      format: "docx",
      objectType: "module",
      relationType: " proposal_contains_module ",
      rootId: " proposal-1 ",
      viewClient,
      workspaceId: "workspace-1",
    });

    expect(viewClient.captureSnapshot).toHaveBeenCalledWith(
      "workspace-1",
      "alice",
      null,
      { rootId: "proposal-1", relationType: "proposal_contains_module" },
    );
    expect(viewClient.createOutput).toHaveBeenCalledWith(
      "workspace-1",
      "alice",
      expect.objectContaining({ format: "docx", objectType: "module" }),
    );
  });

  it("uses stable file extensions for supported formats", () => {
    expect(filename("markdown", "one")).toBe("mnext-output-one.md");
    expect(filename("docx", "two")).toBe("mnext-output-two.docx");
    expect(filename("pdf", "three")).toBe("mnext-output-three.pdf");
  });
});

function outputClient() {
  return {
    captureSnapshot: vi.fn().mockResolvedValue({ snapshotId: "snap-1" }),
    createOutput: vi.fn().mockResolvedValue({
      outputId: "out-1",
      format: "markdown",
    }),
    getOutput: vi.fn().mockResolvedValue({
      meta: { outputId: "out-1", format: "markdown" },
      artifact: "IyBPdXRwdXQ=",
    }),
  };
}
