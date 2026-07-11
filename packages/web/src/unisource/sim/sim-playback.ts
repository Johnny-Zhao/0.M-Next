import type { DataRelationId } from "../model/kernel";
import type { SimTimeline, TimedSimEvent } from "./sim-timing";

export type SimNodePhase = "idle" | "source" | "running" | "done";
export type SimEdgePhase = "idle" | "flowing";

export interface SimPhaseSnapshot {
  readonly currentEventId: string | null;
  readonly nodePhases: ReadonlyMap<string, SimNodePhase>;
  readonly edgePhases: ReadonlyMap<DataRelationId, SimEdgePhase>;
}

export function advancePlayhead(
  playhead: number,
  dt: number,
  speed: number,
  duration: number,
  loop: boolean,
): number {
  const next = playhead + dt * speed;
  if (next < duration) return roundTenth(next);
  if (!loop) return duration;
  return roundTenth(next % duration);
}

export function deriveSimPhase(
  timeline: SimTimeline,
  playhead: number,
): SimPhaseSnapshot {
  const current = currentEvent(timeline.events, playhead);
  const nodePhases = new Map<string, SimNodePhase>();
  const edgePhases = new Map<DataRelationId, SimEdgePhase>();

  for (const event of timeline.events) {
    if (event.kind === "source") {
      nodePhases.set(event.nodeObjectId, "source");
    } else if (current?.id === event.id) {
      nodePhases.set(event.nodeObjectId, "running");
    } else if (playhead >= event.at) {
      nodePhases.set(event.nodeObjectId, "done");
    } else {
      nodePhases.set(event.nodeObjectId, "idle");
    }

    if (event.viaRelationId) {
      edgePhases.set(
        event.viaRelationId,
        playhead >= event.at ? "flowing" : "idle",
      );
    }
  }

  return {
    currentEventId: current?.id ?? null,
    nodePhases,
    edgePhases,
  };
}

function currentEvent(
  events: readonly TimedSimEvent[],
  playhead: number,
): TimedSimEvent | undefined {
  const elapsed = events.filter((event) => playhead >= event.at);
  return elapsed[elapsed.length - 1];
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
