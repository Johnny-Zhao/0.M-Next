import { describe, expect, it } from "vitest";

import { SelectionCoordinator } from "../selection/selection-coordinator";
import {
  coverageStatusLabel,
  coverageStatusTone,
  selectCoverageObject,
  selectMappingCorrespondence,
} from "./mapping-view";

const mapping = {
  correspondenceId: "corr-1",
  relationType: "room_to_zone",
  relationTypeId: "rel-type-1",
  sourceProfile: "interior",
  targetProfile: "thermal",
  sourceTypeCode: "room",
  sourceTypeName: "Room",
  targetTypeCode: "thermal_zone",
  targetTypeName: "Thermal Zone",
  cardinality: "1:1",
  direction: "source_to_target" as const,
  fieldMappings: [],
};

describe("MappingView helpers", () => {
  it("maps coverage status to user-facing labels and tones", () => {
    expect(coverageStatusLabel("mapped")).toBe("已映射");
    expect(coverageStatusLabel("unmapped")).toBe("未映射");
    expect(coverageStatusLabel("stale")).toBe("已过期");
    expect(coverageStatusTone("stale")).toBe("mapping-coverage-stale");
  });

  it("selects correspondence and coverage objects through the coordinator", () => {
    const selection = new SelectionCoordinator();
    selectMappingCorrespondence(selection, mapping);
    expect(selection.current()).toEqual({
      entityType: "relation",
      entityId: "rel-type-1",
    });

    selectCoverageObject(
      selection,
      {
        sourceObjectId: "source-1",
        sourceLabel: "Room 101",
        sourceVersion: 3,
        targetObjectId: "target-1",
        targetLabel: "Zone A",
        targetVersion: 1,
        relationId: "rel-1",
        anchoredSourceVersion: 2,
        status: "stale",
        updatedAt: null,
      },
      "target",
    );

    expect(selection.current()).toEqual({
      entityType: "object",
      entityId: "target-1",
    });
  });
});
