import type {
  DataFieldPrimitive,
  DataObject,
  DataRelation,
  FieldCode,
  ViewDef,
} from "../model/kernel";
import type {
  CanvasConfig,
  CanvasNodeConfig,
  FieldRef,
} from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";

export interface CanvasNodeVm {
  readonly id: string;
  readonly objectId: string;
  readonly indexLabel: string;
  readonly name: string;
  readonly sourceLabel: string;
  readonly status: DataObject["status"];
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly style: NonNullable<CanvasNodeConfig["style"]>;
  readonly visibility: Required<NonNullable<CanvasNodeConfig["visibility"]>>;
  readonly fields: readonly {
    readonly code: FieldCode;
    readonly label: string;
    readonly value: DataFieldPrimitive;
    readonly text: string;
  }[];
  readonly docRefs: number;
}

export interface CanvasEdgeVm {
  readonly id: string;
  readonly relationId: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
}

export interface GotoTargetVm {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface CanvasViewModel {
  readonly viewId: string;
  readonly nodes: readonly CanvasNodeVm[];
  readonly edges: readonly CanvasEdgeVm[];
}

const defaultNodeSize = { w: 210, h: 124 } as const;
const defaultVisibility = {
  sourceBadge: true,
  fieldRows: true,
  docBadge: true,
  edgeLabels: true,
} as const;

export function parseCanvasConfig(view: ViewDef | undefined): CanvasConfig {
  const config = view?.config;
  return {
    nodes: Array.isArray(config?.nodes)
      ? (config.nodes as CanvasNodeConfig[])
      : [],
    edges: Array.isArray(config?.edges)
      ? (config.edges as CanvasConfig["edges"])
      : [],
  };
}

export function buildCanvasViewModel(
  workspace: WorkspaceState,
  view: ViewDef,
): CanvasViewModel {
  const config = parseCanvasConfig(view);
  const nodes = config.nodes.flatMap((node, index) => {
    const object = workspace.objects.find(
      (candidate) => candidate.id === node.objectId,
    );
    if (!object) return [];
    const type = workspace.objectTypes.find(
      (candidate) => candidate.code === object.objectTypeCode,
    );
    const shownFields = node.shownFields ?? ["price", "battery_months"];
    return [
      {
        id: object.id,
        objectId: object.id,
        indexLabel: `#${String(index + 1).padStart(3, "0")}`,
        name: String(
          object.fields.name?.value ?? object.fields.sku?.value ?? object.id,
        ),
        sourceLabel: type?.name ?? object.objectTypeCode,
        status: object.status,
        x: node.x,
        y: node.y,
        w: node.w ?? defaultNodeSize.w,
        h: node.h ?? defaultNodeSize.h,
        style: {
          fill: node.style?.fill ?? "paper",
          color: node.style?.color ?? "ink",
          fontSize: node.style?.fontSize ?? 13,
          radius: node.style?.radius ?? 12,
        },
        visibility: { ...defaultVisibility, ...node.visibility },
        fields: shownFields.flatMap((fieldCode) => {
          const field = type?.fields.find(
            (candidate) => candidate.code === fieldCode,
          );
          const value = object.fields[fieldCode]?.value ?? null;
          return field
            ? [
                {
                  code: fieldCode,
                  label: field.name,
                  value,
                  text: formatCanvasValue(value),
                },
              ]
            : [];
        }),
        docRefs: workspace.fieldRefs.filter((ref) => ref.objectId === object.id)
          .length,
      } satisfies CanvasNodeVm,
    ];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = config.edges.flatMap((edge) => {
    const relation = workspace.relations.find(
      (candidate) =>
        candidate.id === edge.relationId && candidate.status === "active",
    );
    if (
      !relation ||
      !nodeIds.has(relation.sourceId) ||
      !nodeIds.has(relation.targetId)
    )
      return [];
    return [relationToEdge(relation)];
  });
  return { viewId: view.id, nodes, edges };
}

export function deriveGotoTargets(
  workspace: WorkspaceState,
  objectId: string,
): readonly GotoTargetVm[] {
  const object = workspace.objects.find(
    (candidate) => candidate.id === objectId,
  );
  const refs = workspace.fieldRefs.filter((ref) => ref.objectId === objectId);
  const targets: GotoTargetVm[] = [];
  if (object) {
    const type = workspace.objectTypes.find(
      (candidate) => candidate.code === object.objectTypeCode,
    );
    targets.push({
      id: `${objectId}-grid`,
      label: `${type?.name ?? object.objectTypeCode} · 表格`,
      href: `/source/${object.objectTypeCode}?focus=${objectId}`,
    });
  }
  for (const ref of refs) {
    targets.push({
      id: ref.id,
      label: `${expressionName(workspace, ref)} · 文档`,
      href: `/expr/${ref.exprId}?form=doc&locate=${ref.id}`,
    });
  }
  if (workspace.kpis.some((kpi) => kpi.sourceLabel === "产品规格库")) {
    targets.push({
      id: `${objectId}-bi`,
      label: "渠道经营看板 · BI",
      href: "/expr/exp-dashboard?form=bi",
    });
  }
  return targets;
}

export function deriveMixedValue<T>(values: readonly T[]): T | "mixed" | null {
  if (values.length === 0) return null;
  const first = values[0];
  return values.every((value) => value === first) ? first : "mixed";
}

export function canvasConfigWithNodes(
  view: ViewDef,
  nodes: readonly CanvasNodeConfig[],
): Record<string, unknown> {
  const config = parseCanvasConfig(view);
  return { ...view.config, nodes, edges: config.edges };
}

export function screenToCanvasPosition(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top">,
): { readonly x: number; readonly y: number } {
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function relationToEdge(relation: DataRelation): CanvasEdgeVm {
  return {
    id: relation.id,
    relationId: relation.id,
    source: relation.sourceId,
    target: relation.targetId,
    label: String(relation.fields.protocol?.value ?? "Wi-Fi"),
  };
}

function expressionName(workspace: WorkspaceState, ref: FieldRef): string {
  return (
    workspace.expressions.find((candidate) => candidate.id === ref.exprId)
      ?.name ?? ref.exprId
  );
}

function formatCanvasValue(value: DataFieldPrimitive): string {
  if (typeof value === "number") return value.toLocaleString("zh-CN");
  if (value === null) return "空";
  return String(value);
}
