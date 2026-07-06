import { describe, expect, it, vi } from "vitest";

import type {
  CommandClient,
  ObjectType,
  TemplateCatalogItem,
  ViewClient,
} from "@m-next/views";

import {
  findObjectTypeId,
  instantiateProjectWithTemplate,
  isTechnicalProposalTemplate,
  parsePowerBudget,
  proposalRootFields,
} from "./new-project-wizard";

const techdocTemplate: TemplateCatalogItem = template({
  templateId: "tpl-techdoc",
  code: "technical_proposal",
  name: "技术方案",
});

const interiorTemplate: TemplateCatalogItem = template({
  templateId: "tpl-interior",
  code: "interior_design",
  name: "室内设计",
});

const objectTypes: readonly ObjectType[] = [
  { id: "type-proposal", code: "proposal", name: "Proposal", fields: [] },
  { id: "type-module", code: "module", name: "Module", fields: [] },
];

describe("new project wizard helpers", () => {
  it("detects the technical proposal template by code", () => {
    expect(isTechnicalProposalTemplate(techdocTemplate)).toBe(true);
    expect(isTechnicalProposalTemplate(interiorTemplate)).toBe(false);
    expect(isTechnicalProposalTemplate(undefined)).toBe(false);
  });

  it("parses the power budget input and rejects blanks and negatives", () => {
    expect(parsePowerBudget("500")).toBe(500);
    expect(parsePowerBudget(" 12.5 ")).toBe(12.5);
    expect(parsePowerBudget("")).toBeNull();
    expect(parsePowerBudget("   ")).toBeNull();
    expect(parsePowerBudget("-5")).toBeNull();
    expect(parsePowerBudget("abc")).toBeNull();
  });

  it("resolves an object type id from its code", () => {
    expect(findObjectTypeId(objectTypes, "proposal")).toBe("type-proposal");
    expect(findObjectTypeId(objectTypes, "system")).toBeNull();
  });

  it("builds proposal root fields with required keys and optional budget", () => {
    expect(proposalRootFields("我的第一个方案", "alice", 500)).toEqual({
      title: "我的第一个方案",
      version: "v1",
      author: "alice",
      power_budget_w: 500,
    });
    const withoutBudget = proposalRootFields("方案", "", null);
    expect(withoutBudget).toEqual({
      title: "方案",
      version: "v1",
      author: "我",
    });
    expect(withoutBudget.power_budget_w).toBeUndefined();
  });
});

describe("instantiateProjectWithTemplate", () => {
  it("instantiates then creates the proposal root for the technical proposal template", async () => {
    const instantiateWorkspace = vi.fn().mockResolvedValue(undefined);
    const createObject = vi.fn().mockResolvedValue(undefined);
    const objectTypesQuery = vi.fn().mockResolvedValue(objectTypes);

    const created = await instantiateProjectWithTemplate({
      commandClient: { instantiateWorkspace, createObject } as Pick<
        CommandClient,
        "instantiateWorkspace" | "createObject"
      >,
      viewClient: { objectTypes: objectTypesQuery } as Pick<
        ViewClient,
        "objectTypes"
      >,
      template: techdocTemplate,
      name: "我的第一个方案",
      author: "alice",
      powerBudgetW: 500,
      newWorkspaceId: "ws-new",
    });

    expect(instantiateWorkspace).toHaveBeenCalledWith(
      "ws-new",
      "tpl-techdoc",
      1,
      "我的第一个方案",
    );
    expect(objectTypesQuery).toHaveBeenCalledWith("ws-new");
    expect(createObject).toHaveBeenCalledWith("ws-new", "type-proposal", {
      title: "我的第一个方案",
      version: "v1",
      author: "alice",
      power_budget_w: 500,
    });
    expect(created).toEqual({
      workspaceId: "ws-new",
      templateId: "tpl-techdoc",
      templateCode: "technical_proposal",
      version: 1,
    });
  });

  it("does not create a proposal root for non technical proposal templates", async () => {
    const instantiateWorkspace = vi.fn().mockResolvedValue(undefined);
    const createObject = vi.fn().mockResolvedValue(undefined);
    const objectTypesQuery = vi.fn().mockResolvedValue(objectTypes);

    await instantiateProjectWithTemplate({
      commandClient: { instantiateWorkspace, createObject } as Pick<
        CommandClient,
        "instantiateWorkspace" | "createObject"
      >,
      viewClient: { objectTypes: objectTypesQuery } as Pick<
        ViewClient,
        "objectTypes"
      >,
      template: interiorTemplate,
      name: "室内项目",
      author: "alice",
      powerBudgetW: null,
      newWorkspaceId: "ws-interior",
    });

    expect(instantiateWorkspace).toHaveBeenCalledTimes(1);
    expect(objectTypesQuery).not.toHaveBeenCalled();
    expect(createObject).not.toHaveBeenCalled();
  });

  it("fails when the technical proposal template has no proposal type", async () => {
    const instantiateWorkspace = vi.fn().mockResolvedValue(undefined);
    const createObject = vi.fn().mockResolvedValue(undefined);
    const objectTypesQuery = vi.fn().mockResolvedValue([]);

    await expect(
      instantiateProjectWithTemplate({
        commandClient: { instantiateWorkspace, createObject } as Pick<
          CommandClient,
          "instantiateWorkspace" | "createObject"
        >,
        viewClient: { objectTypes: objectTypesQuery } as Pick<
          ViewClient,
          "objectTypes"
        >,
        template: techdocTemplate,
        name: "方案",
        author: "alice",
        powerBudgetW: null,
        newWorkspaceId: "ws-empty",
      }),
    ).rejects.toThrow("方案根");
    expect(createObject).not.toHaveBeenCalled();
  });
});

function template(
  partial: Pick<TemplateCatalogItem, "templateId" | "code" | "name">,
): TemplateCatalogItem {
  return {
    ...partial,
    version: 1,
    latestPublishedVersion: 1,
    publishedAt: "2026-07-01T00:00:00Z",
    description: null,
    tags: { industry: [], profession: [], scenario: [] },
    typeOverview: [],
    typeOverviewTruncated: false,
  };
}
