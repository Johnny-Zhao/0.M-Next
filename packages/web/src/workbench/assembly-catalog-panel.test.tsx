import { describe, expect, it } from "vitest";

import {
  defaultPlaceName,
  filterAssemblies,
  parsePlacementParams,
  sourceRef,
} from "./assembly-catalog-panel";

const assembly = {
  assemblyId: "assembly-1",
  name: "Battery Pack",
  templateVersionId: "template-version-1",
  templateCode: "reuse_profile",
  templateVersion: 1,
  version: 2,
  params: { name: "Battery Pack", capacity: 80 },
  objectTypes: ["component", "sensor"],
  createdAt: "2026-06-29T00:00:00Z",
} as const;

describe("AssemblyCatalogPanel helpers", () => {
  it("filters assemblies by client-side name and template label", () => {
    const result = filterAssemblies([assembly], "battery", "复用");

    expect(result).toEqual([assembly]);
    expect(filterAssemblies([assembly], "missing", "")).toEqual([]);
    expect(filterAssemblies([assembly], "", "other")).toEqual([]);
  });

  it("derives placement defaults and source refs", () => {
    expect(defaultPlaceName(assembly)).toBe("Battery Pack");
    expect(sourceRef(assembly)).toBe("assembly:assembly-1:v2");
  });

  it("parses placement params while keeping a stable name", () => {
    expect(
      parsePlacementParams({
        placementKey: "slot-a",
        name: "Battery A",
        paramsJson: '{"capacity":90}',
      }),
    ).toEqual({ capacity: 90, name: "Battery A" });
  });
});
