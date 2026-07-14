import { Background, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useMemo } from "react";

import { EdgeLabeled } from "../canvas/edge-labeled";
import { NodeCard } from "../canvas/node-card";
import { buildCanvasViewModel } from "../canvas/canvas-view-model";
import { UsMonoTag } from "../primitives";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { PlayBar } from "./play-bar";
import { deriveSimPhase } from "./sim-playback";
import { formatSimTime, type SimTimeline } from "./sim-timing";

const nodeTypes = { unisource: NodeCard };
const edgeTypes = { labeled: EdgeLabeled };

export function SimView({
  exprId,
  loop,
  onLoopChange,
  onPlayingChange,
  onSpeedChange,
  onStop,
  playing,
  playhead,
  speed,
  timeline,
}: {
  readonly exprId: string;
  readonly loop: boolean;
  readonly onLoopChange: (loop: boolean) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onSpeedChange: (speed: 1 | 2) => void;
  readonly onStop: () => void;
  readonly playing: boolean;
  readonly playhead: number;
  readonly speed: 1 | 2;
  readonly timeline: SimTimeline;
}) {
  const workspace = useWorkspaceSnapshot();
  const view = workspace.views.find(
    (candidate) => candidate.exprId === exprId && candidate.kind === "canvas",
  );
  const vm = view ? buildCanvasViewModel(workspace, view) : null;
  const phase = useMemo(
    () => deriveSimPhase(timeline, playhead),
    [timeline, playhead],
  );

  const reactNodes: Node[] = useMemo(
    () =>
      vm?.nodes.map((node) => {
        const event = timeline.events.find(
          (candidate) => candidate.nodeObjectId === node.objectId,
        );
        const nodePhase = phase.nodePhases.get(node.objectId) ?? "idle";
        return {
          id: node.objectId,
          type: "unisource",
          position: { x: node.x, y: node.y },
          width: node.w,
          height: node.h,
          data: {
            node,
            sim: {
              phase: nodePhase,
              timeText: event ? formatSimTime(event.at) : undefined,
              label:
                phase.currentEventId === event?.id || nodePhase === "source"
                  ? event?.label
                  : undefined,
              check: event?.check,
            },
          },
          draggable: false,
        };
      }) ?? [],
    [vm, phase, timeline],
  );

  const reactEdges: Edge[] = useMemo(() => {
    const labels = new Map(
      vm?.nodes.map((node) => [node.objectId, node.visibility.edgeLabels]) ??
        [],
    );
    return (
      vm?.edges.map((edge) => ({
        id: edge.id,
        type: "labeled",
        source: edge.source,
        target: edge.target,
        data: {
          flowing: phase.edgePhases.get(edge.relationId) === "flowing",
          label: edge.label,
          showLabel: labels.get(edge.source) !== false,
        },
      })) ?? []
    );
  }, [vm, phase]);

  if (!vm) return null;

  return (
    <section className="us-sim-shell">
      <div className="us-sim-stage">
        <ReactFlow
          nodes={reactNodes}
          edges={reactEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesConnectable={false}
          nodesDraggable={false}
          panOnDrag
          proOptions={{ hideAttribution: true }}
          zoomOnScroll
        >
          <Background color="var(--us-border-soft)" gap={24} />
        </ReactFlow>
        <div className="us-sim-hint">
          <UsMonoTag active>LIVE</UsMonoTag>
          连线流动 = 事件传播;延迟取自节点「协议」字段的实测参数。
        </div>
        {timeline.danglingEvents.length > 0 ? (
          <div className="us-sim-hint" role="status">
            {Array.from(
              new Set(timeline.danglingEvents.map((event) => event.message)),
            ).join(" · ")}
          </div>
        ) : null}
        <PlayBar
          duration={timeline.duration}
          loop={loop}
          onLoopChange={onLoopChange}
          onPlayingChange={onPlayingChange}
          onSpeedChange={onSpeedChange}
          onStop={onStop}
          playing={playing}
          playhead={playhead}
          speed={speed}
        />
      </div>
    </section>
  );
}
