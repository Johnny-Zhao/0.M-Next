import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import {
  LauncherBody,
  TemplateBody,
  instantiateWorkspaceFromTemplate,
  publishedTemplateVersion,
  workspaceLaunchLocation,
} from "./workspace-launcher";

const template = {
  templateId: "tpl-generic",
  code: "generic_template",
  name: "通用模板",
  version: 2,
  latestPublishedVersion: 4,
  publishedAt: null,
  description: "模板说明",
  tags: { industry: [], profession: [], scenario: [] },
  typeOverview: [],
  typeOverviewTruncated: false,
};

describe("workspace launcher", () => {
  it("opens a selected workspace through the backend boot route", () => {
    expect(workspaceLaunchLocation("ws-pc procurement")).toBe(
      "/us/home?backend=1&ws=ws-pc+procurement",
    );
  });

  it("encodes unicode and reserved workspace ids", () => {
    expect(workspaceLaunchLocation("空间/?a")).toBe(
      "/us/home?backend=1&ws=%E7%A9%BA%E9%97%B4%2F%3Fa",
    );
  });

  it("uses the latest published template version", () => {
    expect(publishedTemplateVersion(template)).toBe(4);
    expect(
      publishedTemplateVersion({ ...template, latestPublishedVersion: 0 }),
    ).toBe(2);
  });

  it("renders backend workspace and template data without domain branches", () => {
    const workspaceMarkup = renderToStaticMarkup(
      createElement(LauncherBody, {
        onOpen: () => undefined,
        state: "ready",
        workspaces: [
          {
            workspaceId: "ws-1",
            name: "后端返回的空间",
            templateCode: template.code,
            updatedAt: "2026-07-21T00:00:00Z",
          },
        ],
      }),
    );
    const templateMarkup = renderToStaticMarkup(
      createElement(TemplateBody, {
        onSelect: () => undefined,
        state: "ready",
        templates: [template],
      }),
    );
    expect(workspaceMarkup).toContain("后端返回的空间");
    expect(workspaceMarkup).toContain("2026-07-21T00:00:00Z");
    expect(templateMarkup).toContain("通用模板");
    expect(templateMarkup).toContain("模板说明");
    expect(templateMarkup).toContain("generic_template");
  });

  it("instantiates a workspace with a generated id and backend template", async () => {
    const instantiateWorkspace = vi.fn().mockResolvedValue(undefined);
    const workspaceId = await instantiateWorkspaceFromTemplate({
      commandClient: { instantiateWorkspace },
      name: "  我的工作空间  ",
      template,
      newWorkspaceId: "ws-created",
    });

    expect(workspaceId).toBe("ws-created");
    expect(instantiateWorkspace).toHaveBeenCalledWith(
      "ws-created",
      "tpl-generic",
      4,
      "我的工作空间",
    );
  });

  it("uses crypto.randomUUID when the caller does not provide an id", async () => {
    const randomUuid = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("11111111-1111-4111-8111-111111111111");
    const instantiateWorkspace = vi.fn().mockResolvedValue(undefined);

    await instantiateWorkspaceFromTemplate({
      commandClient: { instantiateWorkspace },
      name: "新空间",
      template,
    });

    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(instantiateWorkspace).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "tpl-generic",
      4,
      "新空间",
    );
    randomUuid.mockRestore();
  });

  it("rejects an empty workspace name before sending a command", async () => {
    const instantiateWorkspace = vi.fn();
    await expect(
      instantiateWorkspaceFromTemplate({
        commandClient: { instantiateWorkspace },
        name: "  ",
        template,
        newWorkspaceId: "ws-invalid",
      }),
    ).rejects.toThrow("请输入工作空间名称");
    expect(instantiateWorkspace).not.toHaveBeenCalled();
  });
});
