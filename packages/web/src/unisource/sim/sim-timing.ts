import type { DataRelation, DataRelationId } from "../model/kernel";
import type { SimEvent, SimScenario } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";

export type SimNetwork = "normal" | "weak";

export interface TimedSimEvent extends SimEvent {
  readonly at: number;
}

export interface SimTimeline {
  readonly events: readonly TimedSimEvent[];
  readonly duration: number;
  readonly endToEnd: number;
  readonly retries: number;
}

// Demo baselines only. Product latency is intentionally read from relation data.
const delayTable: readonly {
  readonly needle: string;
  readonly delay: number;
}[] = [
  { needle: "Wi-Fi", delay: 0.4 },
  { needle: "BLE", delay: 0.4 },
  { needle: "推送", delay: 0.6 },
  { needle: "联动录像", delay: 2.8 },
];

export function protocolDelay(protocol: unknown): number {
  const text = String(protocol ?? "");
  return delayTable.find((entry) => text.includes(entry.needle))?.delay ?? 0.5;
}

export function deriveSimTimeline(
  scenario: SimScenario,
  workspace: WorkspaceState,
  network: SimNetwork,
): SimTimeline {
  const timed: TimedSimEvent[] = [];
  const relationById = new Map(
    workspace.relations.map((relation) => [relation.id, relation]),
  );
  const multiplier = network === "weak" ? 1.5 : 1;

  for (const event of scenario.events) {
    const relation = event.viaRelationId
      ? relationById.get(event.viaRelationId)
      : undefined;
    const predecessor = relation
      ? predecessorForRelation(timed, event.nodeObjectId, relation)
      : timed[timed.length - 1];
    const delay = relation
      ? protocolDelay(relation.fields.protocol?.value) * multiplier
      : 0;
    timed.push({
      ...event,
      at: roundTenth((predecessor?.at ?? 0) + delay),
    });
  }

  const endToEnd =
    timed
      .filter((event) => event.kind === "action")
      .reduce((max, event) => Math.max(max, event.at), 0) || 0;

  return {
    events: timed,
    duration: scenario.duration,
    endToEnd,
    retries:
      network === "weak"
        ? scenario.events.filter((event) => Boolean(event.viaRelationId)).length
        : 0,
  };
}

export function formatSimTime(seconds: number): string {
  return `00:${seconds.toFixed(1).padStart(4, "0")}`;
}

function predecessorForRelation(
  timed: readonly TimedSimEvent[],
  nodeObjectId: string,
  relation: DataRelation,
): TimedSimEvent | undefined {
  const oppositeId =
    relation.sourceId === nodeObjectId ? relation.targetId : relation.sourceId;
  return (
    [...timed].reverse().find((event) => event.nodeObjectId === oppositeId) ??
    timed[timed.length - 1]
  );
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function relationEventIds(
  timeline: SimTimeline,
): ReadonlyMap<DataRelationId, TimedSimEvent> {
  return new Map(
    timeline.events.flatMap((event) =>
      event.viaRelationId ? [[event.viaRelationId, event] as const] : [],
    ),
  );
}
