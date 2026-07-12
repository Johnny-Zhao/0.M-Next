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
