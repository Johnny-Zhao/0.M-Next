import { describe, expect, it } from "vitest";

import type { DataObject, DataRelation } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import {
  objectBusinessKey,
  relationBusinessKey,
  remapSeedPresentation,
} from "./identity-remap";

describe("identity remap", () => {
  it("matches objects by object type and name", () => {
    const seed = cloneDemoSeed();
    const product = seed.objects.find((object) => object.id === "prod-s3")!;
    const kernelProduct: DataObject = {
      ...product,
      id: "kernel-prod-s3",
    };

    expect(objectBusinessKey(product)).toBe(objectBusinessKey(kernelProduct));
  });

  it("uses code first, then sku, and name only as the final fallback", () => {
    const product = cloneDemoSeed().objects[0]!;
    const withCode = withBusinessFields(product, {
      code: "CODE-1",
      sku: "SKU-1",
      name: "同名对象",
    });
    const withSku = withBusinessFields(product, {
      sku: "SKU-1",
      name: "同名对象",
    });
    const withName = withBusinessFields(product, { name: "同名对象" });

    expect(objectBusinessKey(withCode)).toBe("product_specs:code:CODE-1");
    expect(objectBusinessKey(withSku)).toBe("product_specs:sku:SKU-1");
    expect(objectBusinessKey(withName)).toBe("product_specs:name:同名对象");
  });

  it("remaps field refs, canvas nodes, slot bindings and sim events", () => {
    const seed = cloneDemoSeed();
    const kernelObjects = seed.objects.map((object) =>
      object.id === "prod-s3"
        ? { ...object, id: "kernel-prod-s3" }
        : object.id === "prod-g2"
          ? { ...object, id: "kernel-prod-g2" }
          : object,
    );
    const kernelRelations = seed.relations.map((relation) =>
      relation.id === "rel-s3-g2-interconnect"
        ? {
            ...relation,
            id: "kernel-rel-s3-g2",
            sourceId: "kernel-prod-s3",
            targetId: "kernel-prod-g2",
          }
        : relation,
    );

    const result = remapSeedPresentation({
      seed,
      kernelObjects,
      kernelRelations,
    });

    expect(result.report.matchedObjects).toBeGreaterThan(1);
    expect(result.report.matchedRelations).toBeGreaterThan(0);
    expect(
      result.seed.fieldRefs
        .filter(
          (ref) =>
            ref.label.includes("S3") || ref.objectId === "kernel-prod-s3",
        )
        .some((ref) => ref.objectId === "kernel-prod-s3"),
    ).toBe(true);
    expect(
      result.seed.simScenarios
        .flatMap((scenario) => scenario.events)
        .some((event) => event.nodeObjectId === "kernel-prod-s3"),
    ).toBe(true);
    expect(
      result.seed.simScenarios
        .flatMap((scenario) => scenario.events)
        .some((event) => event.viaRelationId === "kernel-rel-s3-g2"),
    ).toBe(true);
  });

  it("marks unmatched field refs as dangling", () => {
    const seed = cloneDemoSeed();
    const kernelObjects = seed.objects.filter(
      (object) => object.id !== "prod-s3",
    );

    const result = remapSeedPresentation({
      seed,
      kernelObjects,
      kernelRelations: seed.relations,
    });

    expect(result.report.unmatchedRefs).toBeGreaterThan(0);
    expect(
      result.seed.fieldRefs
        .filter((ref) => ref.id.includes("s3") || ref.label.includes("S3"))
        .some((ref) => ref.state === "dangling"),
    ).toBe(true);
    expect(
      result.seed.docModels.find((doc) => doc.binding.objectId === "prod-s3")
        ?.binding.state,
    ).toBe("dangling");
    const portal = result.seed.views.find(
      (view) => view.id === "view-portal-canvas",
    );
    expect(
      (portal?.config.nodes as { objectId: string; state?: string }[]).find(
        (node) => node.objectId === "prod-s3",
      )?.state,
    ).toBe("dangling");
  });

  it("maps same-name objects independently when their codes differ", () => {
    const base = cloneDemoSeed();
    const prototype = base.objects[0]!;
    const kernelObjects = [
      {
        ...withBusinessFields(prototype, { code: "PLAN-A", name: "同名方案" }),
        id: "kernel-a",
      },
      {
        ...withBusinessFields(prototype, { code: "PLAN-B", name: "同名方案" }),
        id: "kernel-b",
      },
    ];
    const seed = {
      ...base,
      objects: [],
      relations: [],
      views: [],
      docModels: [],
      slotBindings: [],
      simScenarios: [],
      fieldRefs: [fieldRef("ref-a", "preset-a"), fieldRef("ref-b", "preset-b")],
    };

    const result = remapSeedPresentation({
      seed,
      kernelObjects,
      kernelRelations: [],
      objectBindings: [
        binding("preset-a", "PLAN-A", "同名方案"),
        binding("preset-b", "PLAN-B", "同名方案"),
      ],
    });

    expect(result.seed.fieldRefs.map((ref) => ref.objectId)).toEqual([
      "kernel-a",
      "kernel-b",
    ]);
  });

  it("builds relation keys from relation type and endpoint business keys", () => {
    const seed = cloneDemoSeed();
    const objectsById = new Map(
      seed.objects.map((object) => [object.id, object]),
    );
    const relation = seed.relations.find(
      (candidate) => candidate.id === "rel-s3-g2-interconnect",
    ) as DataRelation;

    expect(relationBusinessKey(relation, objectsById)).toContain(
      "interconnects_with:product_specs:",
    );
  });
});

function withBusinessFields(
  object: DataObject,
  fields: Readonly<Record<string, string>>,
): DataObject {
  const field = object.fields.name!;
  return {
    ...object,
    fields: Object.fromEntries(
      Object.entries(fields).map(([code, value]) => [
        code,
        { ...field, value },
      ]),
    ),
  };
}

function fieldRef(id: string, objectId: string) {
  return {
    id,
    objectId,
    fieldCode: "name",
    exprId: "exp-test",
    label: id,
    state: "fresh" as const,
  };
}

function binding(presentationId: string, code: string, name: string) {
  return {
    presentationId,
    objectTypeCode: "product_specs",
    fields: { code, name },
  };
}
