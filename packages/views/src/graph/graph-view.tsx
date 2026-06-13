import { Graph, NodeEvent, type IElementEvent } from "@antv/g6";
import { useEffect, useRef, useState, type ReactElement } from "react";

import {
  boundedDepth,
  type RelationSummary,
  type ViewClient,
} from "../api/view-client";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import {
  isObjectSelected,
  type SelectionRef,
} from "../selection/selection-ref";

export interface GraphData {
  readonly nodes: { id: string }[];
  readonly edges: {
    id: string;
    source: string;
    target: string;
    relationType: string;
  }[];
}

export function relationsToGraph(
  relations: readonly RelationSummary[],
): GraphData {
  const nodeIds = new Set(
    relations.flatMap((relation) => [relation.sourceId, relation.targetId]),
  );
  return {
    nodes: [...nodeIds].map((id) => ({ id })),
    edges: relations.map((relation) => ({
      id: relation.relationId,
      source: relation.sourceId,
      target: relation.targetId,
      relationType: relation.relationType,
    })),
  };
}

export function graphSelectedStates(
  data: GraphData,
  selection: SelectionRef | null,
): Record<string, string[]> {
  return Object.fromEntries(
    data.nodes.map((node) => [
      node.id,
      isObjectSelected(selection, node.id) ? ["selected"] : [],
    ]),
  );
}

export function selectGraphNode(
  selection: SelectionCoordinator,
  entityId: string,
): void {
  selection.select({ entityType: "object", entityId });
}

export interface GraphViewProps {
  readonly workspaceId: string;
  readonly relationType: string;
  readonly direction: "out" | "in";
  readonly sourceId: string;
  readonly depth: number;
  readonly client: ViewClient;
  readonly selection: SelectionCoordinator;
}

export function GraphView(props: GraphViewProps): ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<GraphData>({ nodes: [], edges: [] });
  const [relationType, setRelationType] = useState(props.relationType);
  const [direction, setDirection] = useState<"out" | "in">(props.direction);
  const [depth, setDepth] = useState(boundedDepth(props.depth));
  useEffect(() => {
    void props.client
      .relations(
        props.workspaceId,
        relationType,
        direction,
        props.sourceId,
        depth,
      )
      .then((relations) => setData(relationsToGraph(relations)));
  }, [
    props.client,
    depth,
    direction,
    relationType,
    props.sourceId,
    props.workspaceId,
  ]);

  useEffect(() => {
    if (!container.current) return;
    const graph = new Graph({
      container: container.current,
      data,
      autoFit: "view",
    });
    graph.on(NodeEvent.CLICK, (event: IElementEvent) => {
      selectGraphNode(props.selection, String(event.target.id));
    });
    let rendered = false;
    let destroyed = false;
    let selected = props.selection.current();
    const unsubscribe = props.selection.subscribe((nextSelection) => {
      selected = nextSelection;
      if (rendered) {
        void graph.setElementState(graphSelectedStates(data, selected), false);
      }
    });
    void graph.render().then(() => {
      if (destroyed) return;
      rendered = true;
      void graph.setElementState(graphSelectedStates(data, selected), false);
    });
    return () => {
      destroyed = true;
      unsubscribe();
      graph.destroy();
    };
  }, [data, props.selection]);

  return (
    <section aria-label="图谱视图">
      <label>
        关系类型:
        <input
          onChange={(event) => setRelationType(event.currentTarget.value)}
          value={relationType}
        />
      </label>
      <label>
        方向:
        <select
          onChange={(event) =>
            setDirection(event.currentTarget.value as "out" | "in")
          }
          value={direction}
        >
          <option value="out">out</option>
          <option value="in">in</option>
        </select>
      </label>
      <label>
        深度:
        <input
          max={5}
          min={1}
          onChange={(event) =>
            setDepth(boundedDepth(event.currentTarget.valueAsNumber))
          }
          type="number"
          value={depth}
        />
      </label>
      <div ref={container} style={{ height: "420px" }} />
    </section>
  );
}
