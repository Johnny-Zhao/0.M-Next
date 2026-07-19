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
import {
  boundedSubtreeDepth,
  resolveUniqueSubtreeRoot,
  traverseObjectSubtree,
} from "../model/object-subtree";
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

export interface CanvasDanglingRefVm {
  readonly id: string;
  readonly kind: "object" | "relation";
  readonly message: string;
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
  readonly danglingRefs: readonly CanvasDanglingRefVm[];
}

export function initialCanvasRootObjectId(
  workspace: WorkspaceState,
  view: ViewDef,
): string | null {
  const rootTypeCode = view.config.selectionObjectTypeCode;
  if (typeof rootTypeCode !== "string") return null;
  return (
    workspace.objects.find(
      (object) =>
        object.objectTypeCode === rootTypeCode &&
        !terminalObjectStatuses.has(object.status),
    )?.id ?? null
  );
}

export function selectedCanvasRootObjectId(
  workspace: WorkspaceState,
  view: ViewDef,
  objectId: string | null,
): string | null {
  const rootTypeCode = view.config.selectionObjectTypeCode;
  if (typeof rootTypeCode !== "string" || objectId === null) return null;
  const object = workspace.objects.find(
    (candidate) => candidate.id === objectId,
  );
  return object?.objectTypeCode === rootTypeCode &&
    !terminalObjectStatuses.has(object.status)
    ? object.id
    : null;
}

export function canvasNodeConfigFromVm(node: CanvasNodeVm): CanvasNodeConfig {
  return {
    objectId: node.objectId,
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    style: node.style,
    shownFields: node.fields.map((field) => field.code),
    visibility: node.visibility,
  };
}

export function upsertCanvasNodes(
  viewNodes: readonly CanvasNodeConfig[],
  fallbackNodes: readonly CanvasNodeConfig[],
  objectIds: readonly string[],
  patch: (node: CanvasNodeConfig) => CanvasNodeConfig,
): readonly CanvasNodeConfig[] {
  const targets = new Set(objectIds);
  const existingIds = new Set(viewNodes.map((node) => node.objectId));
  const fallbacks = new Map(fallbackNodes.map((node) => [node.objectId, node]));
  const patched = viewNodes.map((node) =>
    targets.has(node.objectId) ? patch(node) : node,
  );
  for (const objectId of targets) {
    if (existingIds.has(objectId)) continue;
    patched.push(patch(fallbacks.get(objectId) ?? { objectId, x: 0, y: 0 }));
  }
  return patched;
}

const defaultNodeSize = { w: 210, h: 124 } as const;
const terminalObjectStatuses = new Set(["archived", "deleted", "soft-deleted"]);
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
  selectedRootObjectId: string | null = initialCanvasRootObjectId(
    workspace,
    view,
  ),
): CanvasViewModel {
  const config =
    selectedCanvasConfig(workspace, view, selectedRootObjectId) ??
    parseCanvasConfig(view);
  const danglingRefs: CanvasDanglingRefVm[] = [];
  const nodes = config.nodes.flatMap((node, index) => {
    const object = workspace.objects.find(
      (candidate) => candidate.id === node.objectId,
    );
    if (!object || node.state === "dangling") {
      danglingRefs.push({
        id: node.objectId,
        kind: "object",
        message: "引用对象不存在",
      });
      return [];
    }
    const type = workspace.objectTypes.find(
      (candidate) => candidate.code === object.objectTypeCode,
    );
    const shownFields =
      node.shownFields ??
      type?.fields.slice(0, 2).map((field) => field.code) ??
      [];
    return [
      {
        id: object.id,
        objectId: object.id,
        indexLabel: `#${String(index + 1).padStart(3, "0")}`,
        name: String(
          object.fields.name?.value ??
            object.fields.code?.value ??
            object.fields.sku?.value ??
            object.id,
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
    if (!relation || edge.state === "dangling") {
      danglingRefs.push({
        id: edge.relationId,
        kind: "relation",
        message: "引用关系不存在",
      });
      return [];
    }
    if (!nodeIds.has(relation.sourceId) || !nodeIds.has(relation.targetId)) {
      danglingRefs.push({
        id: edge.relationId,
        kind: "relation",
        message: "引用关系端点不存在",
      });
      return [];
    }
    return [relationToEdge(workspace, relation)];
  });
  return { viewId: view.id, nodes, edges, danglingRefs };
}

function selectedCanvasConfig(
  workspace: WorkspaceState,
  view: ViewDef,
  selectedRootObjectId: string | null,
): CanvasConfig | null {
  const rootTypeCode = view.config.selectionObjectTypeCode;
  const relationTypeCodes = view.config.selectionRelationTypeCodes;
  if (typeof rootTypeCode !== "string" || !Array.isArray(relationTypeCodes)) {
    return null;
  }
  const configuredRelationTypeCodes = relationTypeCodes.filter(
    (code): code is string => typeof code === "string",
  );
  const root = resolveCanvasRoot(
    workspace,
    selectedRootObjectId,
    rootTypeCode,
    configuredRelationTypeCodes,
    boundedSubtreeDepth(Number(view.config.selectionDepth)),
  );
  if (!root) return null;
  const subtree = traverseObjectSubtree(
    workspace,
    root.id,
    configuredRelationTypeCodes,
    boundedSubtreeDepth(Number(view.config.selectionDepth)),
  );
  if (!subtree) return null;
  const layoutByObjectId = new Map(
    parseCanvasConfig(view).nodes.map((node) => [node.objectId, node]),
  );
  const nodes = Array.from(subtree.objectIds).map((objectId, index) => {
    const layout = layoutByObjectId.get(objectId);
    return {
      objectId,
      x: layout?.x ?? 72 + (index % 3) * 248,
      y: layout?.y ?? 72 + Math.floor(index / 3) * 172,
      w: layout?.w,
      h: layout?.h,
      style: layout?.style,
      shownFields: layout?.shownFields ?? ["code", "name", "status"],
      visibility: layout?.visibility,
    };
  });
  return {
    nodes,
    edges: Array.from(subtree.relationIds).map((relationId) => ({ relationId })),
  };
}

function resolveCanvasRoot(
  workspace: WorkspaceState,
  selectedObjectId: string | null,
  rootTypeCode: string,
  relationTypeCodes: readonly string[],
  depth: number,
): DataObject | undefined {
  const selected = workspace.objects.find(
    (object) =>
      object.id === selectedObjectId &&
      !terminalObjectStatuses.has(object.status),
  );
  if (selected?.objectTypeCode === rootTypeCode) return selected;
  const rootId = selected
    ? resolveUniqueSubtreeRoot(
        workspace,
        selected.id,
        rootTypeCode,
        relationTypeCodes,
        depth,
      )
    : null;
  return rootId
    ? workspace.objects.find((object) => object.id === rootId)
    : undefined;
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
  const biViews = workspace.views.filter(
    (view) =>
      view.kind === "bi" &&
      Array.isArray(view.config.objectTypeCodes) &&
      view.config.objectTypeCodes.includes(object?.objectTypeCode),
  );
  for (const view of biViews) {
    const expression = workspace.expressions.find((candidate) =>
      candidate.viewIds.includes(view.id),
    );
    if (!expression) continue;
    targets.push({
      id: `${objectId}-${view.id}`,
      label: `${expression.name} · BI`,
      href: `/expr/${expression.id}?form=bi`,
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

function relationToEdge(
  workspace: WorkspaceState,
  relation: DataRelation,
): CanvasEdgeVm {
  const relationType = workspace.relationTypes.find(
    (candidate) => candidate.code === relation.relationTypeCode,
  );
  return {
    id: relation.id,
    relationId: relation.id,
    source: relation.sourceId,
    target: relation.targetId,
    label: String(
      relation.fields.label?.value ??
        relationType?.name ??
        relation.relationTypeCode,
    ),
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
