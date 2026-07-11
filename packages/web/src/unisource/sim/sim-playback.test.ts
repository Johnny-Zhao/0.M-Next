import { describe, expect, it } from "vitest";

import type { SimTimeline } from "./sim-timing";
import { advancePlayhead, deriveSimPhase } from "./sim-playback";

const timeline: SimTimeline = {
  duration: 10,
  endToEnd: 3.2,
  retries: 0,
  events: [
    {
      id: "source",
      nodeObjectId: "prod-s3",
      label: "source",
      kind: "source",
      at: 0,
    },
    {
      id: "relay",
      nodeObjectId: "prod-g2",
      viaRelationId: "rel-s3-g2-interconnect",
      label: "relay",
      kind: "relay",
      at: 0.4,
    },
    {
      id: "action",
      nodeObjectId: "prod-e1",
      viaRelationId: "rel-e1-g2-interconnect",
      label: "action",
      kind: "action",
      at: 3.2,
    },
  ],
};

describe("sim playback", () => {
  it("advances with speed and handles loop or terminal clamp", () => {
    expect(advancePlayhead(1, 0.1, 2, 10, false)).toBe(1.2);
    expect(advancePlayhead(9.9, 0.2, 1, 10, false)).toBe(10);
    expect(advancePlayhead(9.9, 0.2, 1, 10, true)).toBe(0.1);
  });

  it("derives current node phases and flowing edges from one playhead", () => {
    const before = deriveSimPhase(timeline, 0.3);
    expect(before.nodePhases.get("prod-s3")).toBe("source");
    expect(before.nodePhases.get("prod-g2")).toBe("idle");
    expect(before.edgePhases.get("rel-s3-g2-interconnect")).toBe("idle");

    const relay = deriveSimPhase(timeline, 0.4);
    expect(relay.currentEventId).toBe("relay");
    expect(relay.nodePhases.get("prod-g2")).toBe("running");
    expect(relay.edgePhases.get("rel-s3-g2-interconnect")).toBe("flowing");

    const done = deriveSimPhase(timeline, 9.9);
    expect(done.nodePhases.get("prod-g2")).toBe("done");
    expect(done.nodePhases.get("prod-e1")).toBe("running");
    expect(done.edgePhases.get("rel-e1-g2-interconnect")).toBe("flowing");
  });
});
