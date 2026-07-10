import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type OnNodeDrag,
  type NodeMouseHandler,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";

import type {
  RelationSummary,
  RelationType,
  ViewClient,
  ViewObject,
} from "@m-next/views";

import {
  fieldLabel,
  objectDisplayTitle,
  objectTypeLabel,
  safeVisibleText,
  statusLabel,
} from "../display-labels";
import { useToast } from "../toast";
import {
  alignNodes,
  distributeNodes,
  type AlignCommand,
  type DistributeCommand,
} from "./align";
import {
  calculateSmartGuides,
  SmartGuidesOverlay,
  type SmartGuides,
} from "./guides";
import {
  copyObjectsToClipboard,
  hasDiagramClipboard,
  readDiagramClipboard,
} from "./clipboard";
import {
  DiagramContextMenu,
  type DiagramContextMenuState,
} from "./context-menu";
import {
  createObjectByCommand,
  diagramShortcutFromEvent,
  softDeleteObjectByCommand,
  type DiagramShortcut,
} from "./shortcuts";
import {
  dataRelationMarker,
  edgeTypes,
  relationRoute,
  type DiagramEdgeData,
} from "./edges";
import {
  ObjectNode,
  type ObjectDerivedChip,
  type ObjectDimensionTone,
  type ObjectFieldPreview,
  type ObjectFlowNode,
  type ObjectNodeData,
  type ObjectTypeVariant,
  type ObjectVisualState,
} from "./object-node";
import { LineageView } from "./lineage-view";
import {
  fieldDimension,
  listDimensions,
  type ActiveDimensionId,
  type DimensionDefinition,
} from "./dimensions";
import { nextConnectionMode } from "./diagram-tool-model";
import { portHandleId, relationPortSides, type PortSide } from "./ports";
import { useWorkbenchContext } from "./workbench";

export type DiagramNode = ObjectFlowNode;
export type DiagramEdge = Edge<DiagramEdgeData, "dataRelation">;

type DiagramRelationSummary = RelationSummary &
  Partial<{
    readonly fields: Readonly<Record<string, unknown>>;
    readonly hierarchical: boolean;
    readonly status: string;
    readonly version: number;
  }>;

export interface DiagramCommandClient {
  createRelation(
    workspaceId: string,
    relationType: string,
    sourceId: string,
    targetId: string,
    ref?: string,
  ): Promise<unknown>;
  unlink(
    workspaceId: string,
    relationId: string,
    expectedVersion: number,
  ): Promise<unknown>;
}

export function isDerivedField(code: string): boolean {
  const normalized = code.toLowerCase();
  return (
    normalized === "fx" ||
    normalized.startsWith("fx_") ||
    normalized.endsWith("_fx") ||
    normalized.includes("derived")
  );
}

export function objectTitle(object: ViewObject): string {
  return objectDisplayTitle(object);
}

export function objectCode(object: ViewObject): string {
  const value = object.fields.code ?? object.fields.identifier;
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    return safeVisibleText(String(value), objectTypeLabel(object.objectType));
  }
  return objectTypeLabel(object.objectType);
}

export function objectDerivedChips(
  object: ViewObject,
): readonly ObjectDerivedChip[] {
  return derivedChipDefinitions.flatMap((definition) => {
    const value =
      object.derived?.[definition.code] ?? object.fields[definition.code];
    if (value === undefined || value === null) return [];
    const formatted = formatDerivedValue(definition.code, value);
    if (!formatted) return [];
    return [
      {
        fieldCode: definition.code,
        label: definition.label,
        value: formatted.value,
        unit: formatted.unit,
      },
    ];
  });
}

function formatDerivedValue(
  code: string,
  value: unknown,
): { readonly value: string; readonly unit?: string } | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    if (code === "area_fx" || code === "total_area_fx") {
      return { value: formatNumber(numeric, 2), unit: "㎡" };
    }
    if (code === "window_floor_ratio_fx") {
      return { value: numeric.toFixed(3) };
    }
  }
  const text = String(value).trim();
  return text ? { value: text } : null;
}

export function objectTypeVariant(objectType: string): ObjectTypeVariant {
  const normalized = objectType.toLowerCase();
  if (normalized === "room" || objectType.includes("房间")) {
    return "room";
  }
  if (normalized === "system" || normalized.includes("system")) {
    return "system";
  }
  if (normalized === "module" || normalized.includes("module")) {
    return "module";
  }
  if (normalized.includes("subsystem") || objectType.includes("分系统")) {
    return "subsystem";
  }
  if (normalized.includes("interface") || objectType.includes("接口")) {
    return "interface";
  }
  if (normalized.includes("requirement") || objectType.includes("需求")) {
    return "requirement";
  }
  return "component";
}

export function objectFieldPreviews(
  object: ViewObject,
  activeDimension: ActiveDimensionId = "all",
): readonly ObjectFieldPreview[] {
  const entries =
    activeDimension === "all"
      ? prioritizedFieldEntries(object.fields)
      : Object.entries(object.fields);
  return entries
    .filter(
      ([code]) =>
        !isDerivedField(code) &&
        !reservedObjectFieldCodes.has(code) &&
        !layoutOnlyFieldCodes.has(code) &&
        (activeDimension === "all" || fieldDimension(code) === activeDimension),
    )
    .slice(0, activeDimension === "all" ? 4 : 2)
    .map(([code, value]) => ({
      code,
      label: diagramFieldLabel(code),
      value: formatFieldValue(code, value),
    }));
}

export function objectReadonly(object: ViewObject): boolean {
  const status = object.status.toLowerCase();
  const source = String(object.fields.source ?? "").toLowerCase();
  return status.includes("readonly") || source === "artifact_sync";
}

function dimensionDefinition(
  activeDimension: ActiveDimensionId,
): DimensionDefinition | undefined {
  if (activeDimension === "all") return undefined;
  return listDimensions().find((dimension) => dimension.id === activeDimension);
}

function objectDimensionTone(
  ruleStatus: ObjectNodeData["ruleStatus"],
  fields: readonly ObjectFieldPreview[],
): ObjectDimensionTone {
  if (fields.length === 0) return "empty";
  if (ruleStatus === "BLOCK") return "block";
  if (ruleStatus === "WARN") return "warn";
  if (ruleStatus === "OK") return "ok";

  const valueText = fields
    .map((field) => field.value)
    .join(" ")
    .toLowerCase();
  if (/block|fail|error|critical|超限|阻断|故障/.test(valueText)) {
    return "block";
  }
  if (/warn|stale|risk|low|high|告警|风险|偏低|偏高/.test(valueText)) {
    return "warn";
  }
  return "normal";
}

export function objectProvenanceText(
  object: ViewObject,
  now = Date.now(),
): string | null {
  const parts = [
    sourceText(object.source),
    freshnessText(object.updatedAt, now),
  ]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function objectVisualState(object: ViewObject): ObjectVisualState {
  const status = object.status.toLowerCase();
  const freshness = String(
    object.fields.freshnessStatus ?? object.fields.freshness ?? "",
  ).toLowerCase();
  if (status.includes("veto") || status.includes("reject")) return "vetoed";
  if (object.ruleStatus === "BLOCK" || status.includes("block")) {
    return "blocked";
  }
  if (status.includes("recomput")) return "recomputing";
  if (status.includes("stale") || freshness === "stale") return "stale";
  return "default";
}

export function objectNodeData(
  object: ViewObject,
  activeDimension: ActiveDimensionId = "all",
): ObjectNodeData {
  const fields = objectFieldPreviews(object, activeDimension);
  const dimension = dimensionDefinition(activeDimension);
  const dimensionTone = dimension
    ? objectDimensionTone(object.ruleStatus, fields)
    : undefined;
  return {
    objectId: object.objectId,
    title: objectTitle(object),
    objectType: object.objectType,
    status: statusLabel(object.status),
    code: objectCode(object),
    typeVariant: objectTypeVariant(object.objectType),
    fields,
    derivedChips: objectDerivedChips(object),
    ruleStatus: object.ruleStatus,
    activeDimension: dimension?.id,
    dimensionLabel: dimension?.label,
    dimensionTone,
    dimensionEmpty: Boolean(dimension && fields.length === 0),
    provenanceText: objectProvenanceText(object),
    visualState: objectVisualState(object),
    readonly: objectReadonly(object),
  };
}

export function relationLabel(relation: DiagramRelationSummary): string {
  const name = relation.fields?.name ?? relation.fields?.title;
  if (name === undefined || name === null || String(name).trim() === "") {
    return safeVisibleText(relation.relationType, "关系");
  }
  return `关系 / ${safeVisibleText(String(name), "未命名")}`;
}

function relationStatus(
  relation: DiagramRelationSummary,
): DiagramEdgeData["status"] {
  return relation.status === "UNLINKED" ? "UNLINKED" : "ACTIVE";
}

function relationVersion(relation: DiagramRelationSummary): number | undefined {
  return typeof relation.version === "number" && relation.version > 0
    ? relation.version
    : undefined;
}

function edgePorts(
  sourceNode: DiagramNode | undefined,
  targetNode: DiagramNode | undefined,
): { readonly sourceSide: PortSide; readonly targetSide: PortSide } {
  if (!sourceNode || !targetNode) {
    return { sourceSide: "right", targetSide: "left" };
  }
  return relationPortSides(sourceNode.position, targetNode.position);
}

export function objectsAndRelationsToFlow(
  objects: readonly ViewObject[],
  relations: readonly RelationSummary[],
  selectedObjectIds: string | readonly string[] | null,
  activeDimension: ActiveDimensionId = "all",
): { readonly nodes: DiagramNode[]; readonly edges: DiagramEdge[] } {
  const selectedIds = normalizeSelectedIds(selectedObjectIds);
  const nodes = objects.map(
    (object, index): DiagramNode => ({
      id: object.objectId,
      type: "object",
      position: {
        x: 80 + (index % 4) * 240,
        y: 80 + Math.floor(index / 4) * 160,
      },
      selected: selectedIds.has(object.objectId),
      data: objectNodeData(object, activeDimension),
    }),
  );
  const objectIds = new Set(objects.map((object) => object.objectId));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = relations
    .filter(
      (relation) =>
        objectIds.has(relation.sourceId) && objectIds.has(relation.targetId),
    )
    .map((relation): DiagramEdge => {
      const projected = relation as DiagramRelationSummary;
      const ports = edgePorts(
        nodesById.get(relation.sourceId),
        nodesById.get(relation.targetId),
      );
      return {
        id: relation.relationId,
        source: relation.sourceId,
        sourceHandle: portHandleId("source", ports.sourceSide),
        target: relation.targetId,
        targetHandle: portHandleId("target", ports.targetSide),
        type: "dataRelation",
        markerEnd: dataRelationMarker,
        data: {
          label: relationLabel(projected),
          relationType: relation.relationType,
          route: relationRoute(relation.relationType),
          status: relationStatus(projected),
          version: relationVersion(projected),
          // TODO(view-API): expose rule hit state before rendering failed edges.
          ruleState: "normal",
        },
      };
    });
  return { nodes, edges };
}

function normalizeSelectedIds(
  selectedObjectIds: string | readonly string[] | null,
): ReadonlySet<string> {
  if (!selectedObjectIds) return new Set();
  return new Set(
    typeof selectedObjectIds === "string"
      ? [selectedObjectIds]
      : selectedObjectIds,
  );
}

const nodeTypes = { object: ObjectNode };
const snapGrid: [number, number] = [24, 24];
const noGuides: SmartGuides = { x: [], y: [] };
const reservedObjectFieldCodes = new Set([
  "code",
  "identifier",
  "ruleStatus",
  "checkStatus",
  "source",
  "provenanceSource",
  "freshness",
  "freshnessStatus",
  "downstreamCount",
  "dependencyCount",
  "uiState",
  "visualState",
]);
const layoutOnlyFieldCodes = new Set(["name", "title", "usage"]);
const preferredFieldCodes = [
  "length_m",
  "width_m",
  "orientation",
  "window_area_m2",
] as const;
const derivedChipDefinitions = [
  { code: "area_fx", label: "面积" },
  { code: "window_floor_ratio_fx", label: "窗地比" },
] as const;

function prioritizedFieldEntries(
  fields: Readonly<Record<string, unknown>>,
): ReadonlyArray<readonly [string, unknown]> {
  const used = new Set<string>();
  const preferred = preferredFieldCodes.flatMap((code) => {
    const value = fields[code];
    if (value === undefined || value === null) return [];
    used.add(code);
    return [[code, value] as const];
  });
  const rest = Object.entries(fields).filter(([code, value]) => {
    if (used.has(code)) return false;
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
  return [...preferred, ...rest];
}

function diagramFieldLabel(code: string): string {
  if (code === "length_m") return "长";
  if (code === "width_m") return "宽";
  if (code === "orientation") return "朝向";
  if (code === "window_area_m2") return "窗面积";
  return fieldLabel(code);
}

function formatFieldValue(code: string, value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    if (code === "length_m" || code === "width_m") {
      return `${formatNumber(numeric, 2)} m`;
    }
    if (code === "window_area_m2") return `${formatNumber(numeric, 2)} ㎡`;
  }
  if (code === "orientation") return orientationLabel(value);
  return String(value);
}

function orientationLabel(value: unknown): string {
  const normalized = String(value).trim().toUpperCase();
  if (normalized === "N") return "北";
  if (normalized === "S") return "南";
  if (normalized === "E") return "东";
  if (normalized === "W") return "西";
  return String(value);
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return value.toLocaleString("zh-CN", { maximumFractionDigits });
}

function sourceText(source: string | null): string | null {
  if (!source || source.trim() === "") return null;
  const normalized = source.trim();
  const label =
    sourceLabels[normalized] ??
    sourceLabels[normalized.toLowerCase()] ??
    normalized;
  return `来源 ${label}`;
}

function freshnessText(updatedAt: string | null, now: number): string | null {
  if (!updatedAt) return null;
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return null;
  const elapsed = Math.max(0, now - time);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return "刚刚更新";
  if (elapsed < hour) return `新鲜 ${Math.floor(elapsed / minute)}m`;
  if (elapsed < day) return `新鲜 ${Math.floor(elapsed / hour)}h`;
  return `新鲜 ${Math.floor(elapsed / day)}d`;
}

const sourceLabels: Readonly<Record<string, string>> = {
  manual: "人工绘制",
  rule: "规则",
  AI: "AI",
  ai: "AI",
  artifact_sync: "制品同步",
  simulation: "仿真",
  system: "系统",
};

function selectedIdsFor(nodes: readonly DiagramNode[]): ReadonlySet<string> {
  return new Set(nodes.filter((node) => node.selected).map((node) => node.id));
}

interface DiagramData {
  readonly objects: readonly ViewObject[];
  readonly relations: readonly RelationSummary[];
}

export const defaultDiagramObjectFields = {
  name: "新模块",
  power_w: 0,
} as const;

const diagramCreateResolveAttempts = 5;
const diagramCreateResolveDelayMs = 350;
const diagramRelationRefreshDelayMs = 400;
const technicalDiagramObjectTypes = [
  "system",
  "module",
  "interface",
  "requirement",
] as const;
const proposalContainsRelationByObjectType: Readonly<Record<string, string>> = {
  module: "proposal_contains_module",
  system: "proposal_contains_system",
};
const showDiagramDimensionControls = false;
const diagramRelationByEndpoint: Readonly<Record<string, string>> = {
  "module->module": "proposal_depends_on",
  "module->interface": "proposal_interfaces_with",
  "module->requirement": "proposal_satisfies",
  "proposal->module": "proposal_contains_module",
  "proposal_node->module": "proposal_contains_module",
  "system->module": "proposal_contains_module",
  "proposal->system": "proposal_contains_system",
};

interface LineageTarget {
  readonly object: ViewObject;
  readonly fieldCode: string;
}

interface DiagramConnectionEndpoint {
  readonly objectId: string;
  readonly objectType: string;
}

export function diagramObjectTypesForTemplate(
  templateCode: string | null | undefined,
  objectTypeCode: string,
): readonly string[] {
  return templateCode === "technical_proposal"
    ? technicalDiagramObjectTypes
    : [objectTypeCode];
}

export async function loadDiagramObjects(params: {
  readonly viewClient: Pick<ViewClient, "objects">;
  readonly workspaceId: string;
  readonly templateCode?: string | null;
  readonly objectType: string;
}): Promise<readonly ViewObject[]> {
  const objectTypes = diagramObjectTypesForTemplate(
    params.templateCode,
    params.objectType,
  );
  const pages = await Promise.all(
    objectTypes.map((type) =>
      params.viewClient.objects(params.workspaceId, type, 0, 100),
    ),
  );
  return pages.flatMap((page) => page.items);
}

export function resolveDiagramConnectionEndpoints(params: {
  readonly objects: readonly ViewObject[];
  readonly nodes: readonly DiagramNode[];
  readonly connection: Connection;
}): {
  readonly source: DiagramConnectionEndpoint;
  readonly target: DiagramConnectionEndpoint;
} | null {
  if (!params.connection.source || !params.connection.target) return null;
  const objectsById = new Map(
    params.objects.map((object) => [object.objectId, object]),
  );
  const nodesById = new Map(params.nodes.map((node) => [node.id, node]));
  const endpoint = (objectId: string): DiagramConnectionEndpoint | null => {
    const nodeData = nodesById.get(objectId)?.data;
    if (
      typeof nodeData?.objectId === "string" &&
      nodeData.objectId.trim() !== "" &&
      typeof nodeData.objectType === "string" &&
      nodeData.objectType.trim() !== ""
    ) {
      return {
        objectId: nodeData.objectId,
        objectType: nodeData.objectType,
      };
    }
    const object = objectsById.get(objectId);
    return object ? { objectId, objectType: object.objectType } : null;
  };
  const source = endpoint(params.connection.source);
  const target = endpoint(params.connection.target);
  return source && target ? { source, target } : null;
}

export async function connectDiagramObjects(
  commandClient: Pick<DiagramCommandClient, "createRelation">,
  workspaceId: string,
  relationType: string,
  connection: Connection,
): Promise<boolean> {
  if (!connection.source || !connection.target) return false;
  await commandClient.createRelation(
    workspaceId,
    relationType,
    connection.source,
    connection.target,
    "diagram",
  );
  return true;
}

export async function connectDiagramObjectsInMode(
  commandClient: Pick<DiagramCommandClient, "createRelation">,
  workspaceId: string,
  relationType: string,
  connection: Connection,
  connectionMode: boolean,
): Promise<"connected" | "disabled" | "invalid"> {
  if (!connectionMode) return "disabled";
  const connected = await connectDiagramObjects(
    commandClient,
    workspaceId,
    relationType,
    connection,
  );
  return connected ? "connected" : "invalid";
}

export async function unlinkDiagramEdges(
  commandClient: Pick<DiagramCommandClient, "unlink">,
  workspaceId: string,
  deletedEdges: readonly DiagramEdge[],
): Promise<void> {
  const versionedEdges = deletedEdges.map((edge) => ({
    id: edge.id,
    version: edge.data?.version,
  }));
  const missingVersion = versionedEdges.find((edge) => !edge.version);
  if (missingVersion) {
    throw new Error("TODO(view-API): 删除关系需要关系版本投影");
  }
  await Promise.all(
    versionedEdges.map((edge) =>
      commandClient.unlink(workspaceId, edge.id, edge.version as number),
    ),
  );
}

export async function unlinkSelectedRelations(
  commandClient: Pick<DiagramCommandClient, "unlink">,
  workspaceId: string,
  relations: readonly Pick<RelationSummary, "relationId" | "version">[],
): Promise<void> {
  // 删关系走乐观锁:expectedVersion 必须是关系的真实当前版本
  // (与 inspector-panel / unlinkDiagramEdges 一致)。此处曾写死 1,
  // 导致版本≠1 时内核版本冲突、右键“删除关系”删不掉、看似无响应。
  const missingVersion = relations.find(
    (relation) =>
      !(typeof relation.version === "number" && relation.version > 0),
  );
  if (missingVersion) {
    throw new Error("TODO(view-API): 删除关系需要关系版本投影");
  }
  await Promise.all(
    relations.map((relation) =>
      commandClient.unlink(workspaceId, relation.relationId, relation.version),
    ),
  );
}

export function resolveEdgeDeletionTarget(
  edgeId: string,
  relations: readonly Pick<RelationSummary, "relationId" | "version">[],
  edges: readonly DiagramEdge[],
): { readonly relationId: string; readonly version: number } | null {
  const relation = relations.find(
    (item) =>
      item.relationId === edgeId &&
      typeof item.version === "number" &&
      item.version > 0,
  );
  if (relation) {
    return { relationId: relation.relationId, version: relation.version };
  }
  const version = edges.find((edge) => edge.id === edgeId)?.data?.version;
  return typeof version === "number" && version > 0
    ? { relationId: edgeId, version }
    : null;
}

export function containsRelationCodesForObjectType(
  objectTypeCode: string,
): readonly string[] {
  const code = proposalContainsRelationByObjectType[objectTypeCode];
  return code ? [code] : [];
}

export function pickCreatedDiagramObjectId(params: {
  readonly objects: readonly ViewObject[];
  readonly knownIds: ReadonlySet<string>;
  readonly expectedName?: string;
}): string | null {
  const fresh = params.objects.filter(
    (object) => !params.knownIds.has(object.objectId),
  );
  const named = params.expectedName
    ? fresh.find(
        (object) => String(object.fields.name ?? "") === params.expectedName,
      )
    : undefined;
  return named?.objectId ?? fresh[0]?.objectId ?? null;
}

export type DiagramRelationInference =
  | {
      readonly kind: "match";
      readonly relationTypeCode: string;
      readonly relationTypeId: string;
      // 仅反向端点映射命中时为 true;调用方据此交换 source/target。
      readonly reversed?: true;
    }
  | { readonly kind: "none" }
  | { readonly kind: "ambiguous" };

export function inferDiagramRelationType(params: {
  readonly relationTypes: readonly RelationType[];
  readonly sourceObjectType: string;
  readonly targetObjectType: string;
}): DiagramRelationInference {
  const forwardCode =
    diagramRelationByEndpoint[
      `${params.sourceObjectType}->${params.targetObjectType}`
    ];
  const reverseCode =
    diagramRelationByEndpoint[
      `${params.targetObjectType}->${params.sourceObjectType}`
    ];
  const code = forwardCode ?? reverseCode;
  if (!code) return { kind: "none" };
  const matches = params.relationTypes.filter((type) => type.code === code);
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) return { kind: "ambiguous" };
  const match = {
    kind: "match" as const,
    relationTypeCode: matches[0]!.code,
    relationTypeId: matches[0]!.id,
  };
  // 关系是有向的:只有反向端点映射命中时标记 reversed,
  // 让“反着拖”也能建出方向正确的关系(而非报“没有可建的关系”)。
  return forwardCode ? match : { ...match, reversed: true };
}

export function diagramConnectionRejection(params: {
  readonly sourceId: string;
  readonly targetId: string;
  readonly relationTypeCode: string;
  readonly relations: readonly Pick<
    RelationSummary,
    "relationType" | "sourceId" | "targetId"
  >[];
}): "self" | "duplicate" | null {
  if (params.sourceId === params.targetId) return "self";
  const duplicate = params.relations.some(
    (relation) =>
      relation.relationType === params.relationTypeCode &&
      relation.sourceId === params.sourceId &&
      relation.targetId === params.targetId,
  );
  return duplicate ? "duplicate" : null;
}

export function diagramRelationCodesForVisibleObjects(params: {
  readonly objects: readonly ViewObject[];
  readonly relationType: string;
  readonly relationTypes: readonly RelationType[];
}): readonly string[] {
  const availableCodes = new Set(params.relationTypes.map((type) => type.code));
  const endpointCodes = params.objects.flatMap((source) =>
    params.objects.flatMap((target) => {
      const code =
        diagramRelationByEndpoint[`${source.objectType}->${target.objectType}`];
      return code ? [code] : [];
    }),
  );
  return [params.relationType, ...endpointCodes].filter(
    (code, index, codes): code is string =>
      Boolean(code) &&
      codes.indexOf(code) === index &&
      availableCodes.has(code),
  );
}

function uniqueDiagramRelations(
  relations: readonly RelationSummary[],
): readonly RelationSummary[] {
  return Array.from(
    new Map(
      relations.map((relation) => [relation.relationId, relation]),
    ).values(),
  );
}

export async function loadDiagramRelations(params: {
  readonly viewClient: Pick<ViewClient, "relationTypes" | "relations">;
  readonly workspaceId: string;
  readonly relationType: string;
  readonly rootId?: string;
  readonly objects: readonly ViewObject[];
}): Promise<readonly RelationSummary[]> {
  const relationTypes = await params.viewClient.relationTypes(
    params.workspaceId,
  );
  const relationCodes = diagramRelationCodesForVisibleObjects({
    objects: params.objects,
    relationType: params.relationType,
    relationTypes,
  });
  const sourceIds = Array.from(
    new Set(params.objects.map((object) => object.objectId)),
  );
  const visibleRelations =
    sourceIds.length === 0 || relationCodes.length === 0
      ? []
      : await Promise.all(
          sourceIds.flatMap((sourceId) =>
            relationCodes.map((code) =>
              params.viewClient.relations(
                params.workspaceId,
                code,
                "out",
                sourceId,
                1,
              ),
            ),
          ),
        );
  const rootRelations =
    params.rootId && relationCodes.includes(params.relationType)
      ? await params.viewClient.relations(
          params.workspaceId,
          params.relationType,
          "out",
          params.rootId,
          2,
        )
      : [];
  return uniqueDiagramRelations([...visibleRelations.flat(), ...rootRelations]);
}

export function refreshDiagramAfterRelationCreated(params: {
  readonly refreshViews: () => void;
  readonly scheduleRefresh: (callback: () => void, delayMs: number) => void;
}): void {
  params.refreshViews();
  params.scheduleRefresh(params.refreshViews, diagramRelationRefreshDelayMs);
}

export function removeDiagramRelationsLocally<
  TRelation extends { readonly relationId: string },
  TEdge extends { readonly id: string },
>(params: {
  readonly relations: readonly TRelation[];
  readonly edges: readonly TEdge[];
  readonly selectedEdgeIds: readonly string[];
  readonly relationIds: readonly string[];
}): {
  readonly relations: readonly TRelation[];
  readonly edges: readonly TEdge[];
  readonly selectedEdgeIds: readonly string[];
} {
  const deletedIds = new Set(params.relationIds);
  if (deletedIds.size === 0) {
    return {
      relations: params.relations,
      edges: params.edges,
      selectedEdgeIds: params.selectedEdgeIds,
    };
  }
  return {
    relations: params.relations.filter(
      (relation) => !deletedIds.has(relation.relationId),
    ),
    edges: params.edges.filter((edge) => !deletedIds.has(edge.id)),
    selectedEdgeIds: params.selectedEdgeIds.filter((id) => !deletedIds.has(id)),
  };
}

export function optimisticDiagramObject(params: {
  readonly objectId: string;
  readonly objectType: string;
  readonly fields: Readonly<Record<string, unknown>>;
}): ViewObject {
  return {
    objectId: params.objectId,
    objectType: params.objectType,
    status: "DRAFT",
    version: 1,
    fields: { ...params.fields },
    updatedAt: new Date(0).toISOString(),
    source: null,
    ruleStatus: "OK",
  };
}

export function optimisticDiagramRelation(params: {
  readonly relationType: string;
  readonly sourceId: string;
  readonly targetId: string;
}): RelationSummary {
  // 乐观关系:临时 relationId 前缀,避免与后端真实 id 冲突。
  // 刷新回读会整体替换 data.relations,故此关系为短命过渡态。
  return {
    relationId: `optimistic-rel:${params.sourceId}->${params.targetId}:${params.relationType}`,
    relationType: params.relationType,
    sourceId: params.sourceId,
    targetId: params.targetId,
    version: 1,
  };
}

export function mergeOptimisticDiagramObjects(
  reloaded: readonly ViewObject[],
  current: readonly ViewObject[],
): ViewObject[] {
  // 回读后合并:保留本地有、后端分页还没返回的乐观对象(按 objectId)。
  const reloadedIds = new Set(reloaded.map((object) => object.objectId));
  return [
    ...reloaded,
    ...current.filter((object) => !reloadedIds.has(object.objectId)),
  ];
}

export function mergeOptimisticDiagramRelations(
  reloaded: readonly RelationSummary[],
  current: readonly RelationSummary[],
): RelationSummary[] {
  // 按“源->靶:类型”去重:真实关系已回读时丢弃同键的乐观临时关系,
  // 否则保留尚未同步的乐观关系,既不冲掉连线又不产生重复边。
  const relationKey = (
    relation: Pick<RelationSummary, "sourceId" | "targetId" | "relationType">,
  ): string =>
    `${relation.sourceId}->${relation.targetId}:${relation.relationType}`;
  const reloadedKeys = new Set(reloaded.map(relationKey));
  return [
    ...reloaded,
    ...current.filter((relation) => !reloadedKeys.has(relationKey(relation))),
  ];
}

export function upsertOptimisticDiagramNode(params: {
  readonly nodes: readonly DiagramNode[];
  readonly object: ViewObject;
  readonly activeDimension: ActiveDimensionId;
}): DiagramNode[] {
  const existing = params.nodes.find(
    (node) => node.id === params.object.objectId,
  );
  const index = existing ? params.nodes.indexOf(existing) : params.nodes.length;
  const next: DiagramNode = {
    id: params.object.objectId,
    type: "object",
    position: existing?.position ?? {
      x: 80 + (index % 4) * 240,
      y: 80 + Math.floor(index / 4) * 160,
    },
    selected: existing?.selected,
    data: objectNodeData(params.object, params.activeDimension),
  };
  return existing
    ? params.nodes.map((node) => (node.id === next.id ? next : node))
    : [...params.nodes, next];
}

async function resolveCreatedDiagramObjectId(params: {
  readonly viewClient: Pick<ViewClient, "objects">;
  readonly workspaceId: string;
  readonly objectTypeCode: string;
  readonly knownIds: ReadonlySet<string>;
  readonly expectedName?: string;
}): Promise<string | null> {
  for (let attempt = 0; attempt < diagramCreateResolveAttempts; attempt += 1) {
    const page = await params.viewClient.objects(
      params.workspaceId,
      params.objectTypeCode,
      0,
      100,
    );
    const objectId = pickCreatedDiagramObjectId({
      objects: page.items,
      knownIds: params.knownIds,
      expectedName: params.expectedName,
    });
    if (objectId) return objectId;
    await new Promise((resolve) =>
      window.setTimeout(resolve, diagramCreateResolveDelayMs),
    );
  }
  return null;
}

function relationTypeIdForCreatedObject(
  relationTypes: readonly RelationType[],
  objectTypeCode: string,
): string | null {
  const candidates = containsRelationCodesForObjectType(objectTypeCode);
  return (
    relationTypes.find((type) => candidates.includes(type.code))?.id ?? null
  );
}

async function attachCreatedObjectToRoot(params: {
  readonly viewClient: Pick<ViewClient, "relationTypes">;
  readonly commandClient: Pick<DiagramCommandClient, "createRelation">;
  readonly workspaceId: string;
  readonly rootId: string;
  readonly objectTypeCode: string;
  readonly objectId: string | null;
}): Promise<void> {
  if (!params.objectId || params.rootId.trim() === "") return;
  const relationTypes = await params.viewClient.relationTypes(
    params.workspaceId,
  );
  const relationTypeId = relationTypeIdForCreatedObject(
    relationTypes,
    params.objectTypeCode,
  );
  if (!relationTypeId) return;
  await params.commandClient.createRelation(
    params.workspaceId,
    relationTypeId,
    params.rootId,
    params.objectId,
  );
}

export function DiagramPanel(): ReactElement {
  const context = useWorkbenchContext();
  const {
    objectType,
    refreshVersion,
    relationType,
    reportError,
    rootId,
    templateCode,
    viewClient,
    workspaceId,
  } = context;
  const toast = useToast();
  const [data, setData] = useState<DiagramData>({
    objects: [],
    relations: [],
  });
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<readonly string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<readonly string[]>([]);
  const [menu, setMenu] = useState<DiagramContextMenuState | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>([]);
  const dataRef = useRef<DiagramData>(data);
  const nodesRef = useRef<readonly DiagramNode[]>(nodes);
  const panelRef = useRef<HTMLElement | null>(null);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridVariant, setGridVariant] = useState<BackgroundVariant>(
    BackgroundVariant.Dots,
  );
  const [activeDimension, setActiveDimension] =
    useState<ActiveDimensionId>("all");
  const [guides, setGuides] = useState<SmartGuides>(noGuides);
  const [lineageTarget, setLineageTarget] = useState<LineageTarget | null>(
    null,
  );
  const connectionMode = context.connectionMode;
  const setConnectionMode = context.setConnectionMode;

  useEffect(() => {
    if (connectionMode) panelRef.current?.focus();
  }, [connectionMode]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(
    () =>
      context.selection.subscribe((selected) => {
        const objectId =
          selected?.entityType === "object" ? selected.entityId : null;
        setSelectedObjectId(objectId);
        setSelectedNodeIds(objectId ? [objectId] : []);
        setSelectedEdgeIds([]);
      }),
    [context.selection],
  );

  useEffect(() => {
    let disposed = false;
    async function load(): Promise<void> {
      try {
        const objects = await loadDiagramObjects({
          viewClient,
          workspaceId,
          templateCode,
          objectType,
        });
        const relations = await loadDiagramRelations({
          viewClient,
          workspaceId,
          relationType,
          rootId,
          objects,
        });
        if (!disposed) setData({ objects, relations });
      } catch (error) {
        if (!disposed) {
          reportError(
            error instanceof Error ? error.message : "读取图面板失败",
          );
          setData({ objects: [], relations: [] });
        }
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [
    objectType,
    refreshVersion,
    relationType,
    reportError,
    rootId,
    templateCode,
    viewClient,
    workspaceId,
  ]);

  useEffect(() => {
    const flow = objectsAndRelationsToFlow(
      data.objects,
      data.relations,
      selectedNodeIds.length > 0 ? selectedNodeIds : selectedObjectId,
      activeDimension,
    );
    const objectsById = new Map(
      data.objects.map((object) => [object.objectId, object]),
    );
    setNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node]));
      return flow.nodes.map((node) => {
        const current = currentById.get(node.id);
        const object = objectsById.get(node.id);
        const dataWithLineage = object
          ? {
              ...node.data,
              onDerivedChipClick: (fieldCode: string) =>
                setLineageTarget({ object, fieldCode }),
            }
          : node.data;
        if (!current) return { ...node, data: dataWithLineage };
        return {
          ...node,
          data: dataWithLineage,
          position: current.position,
          width: current.width,
          height: current.height,
          measured: current.measured,
        };
      });
    });
    setEdges(
      flow.edges.map((edge) => ({
        ...edge,
        selected: selectedEdgeIds.includes(edge.id),
      })),
    );
  }, [
    data,
    activeDimension,
    selectedEdgeIds,
    selectedNodeIds,
    selectedObjectId,
    setEdges,
    setNodes,
  ]);

  const onNodeClick = useMemo<NodeMouseHandler<DiagramNode>>(
    () => (_event, node) => {
      context.selection.select({ entityType: "object", entityId: node.id });
    },
    [context.selection],
  );

  const alignSelected = useCallback(
    (command: AlignCommand) => {
      setNodes((currentNodes) =>
        alignNodes(currentNodes, selectedIdsFor(currentNodes), command),
      );
    },
    [setNodes],
  );

  const distributeSelected = useCallback(
    (command: DistributeCommand) => {
      setNodes((currentNodes) =>
        distributeNodes(currentNodes, selectedIdsFor(currentNodes), command),
      );
    },
    [setNodes],
  );

  const onNodeDrag = useCallback<OnNodeDrag<DiagramNode>>(
    (_event, node) => {
      setGuides(calculateSmartGuides(node, nodes));
    },
    [nodes],
  );

  const clearGuides = useCallback<OnNodeDrag<DiagramNode>>(() => {
    setGuides(noGuides);
  }, []);

  const onSelectionChange = useCallback(
    (selection: OnSelectionChangeParams<DiagramNode, DiagramEdge>) => {
      const nodeIds = selection.nodes.map((node) => node.id);
      setSelectedNodeIds(nodeIds);
      setSelectedEdgeIds(selection.edges.map((edge) => edge.id));
      if (nodeIds.length === 1) {
        context.selection.select({
          entityType: "object",
          entityId: nodeIds[0],
        });
      } else if (selection.edges.length === 1) {
        context.selection.select({
          entityType: "relation",
          entityId: selection.edges[0].id,
        });
      } else {
        setSelectedObjectId(null);
        context.selection.clear();
      }
    },
    [context.selection],
  );

  const onNodeContextMenu = useMemo<NodeMouseHandler<DiagramNode>>(
    () => (event, node) => {
      event.preventDefault();
      setSelectedNodeIds([node.id]);
      setSelectedEdgeIds([]);
      context.selection.select({ entityType: "object", entityId: node.id });
      setMenu({
        context: { kind: "node", nodeId: node.id },
        x: event.clientX,
        y: event.clientY,
      });
    },
    [context.selection],
  );

  const onEdgeContextMenu = useMemo<EdgeMouseHandler<DiagramEdge>>(
    () => (event, edge) => {
      event.preventDefault();
      setSelectedNodeIds([]);
      setSelectedEdgeIds([edge.id]);
      context.selection.select({ entityType: "relation", entityId: edge.id });
      setMenu({
        context: { kind: "edge", edgeId: edge.id },
        x: event.clientX,
        y: event.clientY,
      });
    },
    [context.selection],
  );

  function openPaneMenu(event: MouseEvent | ReactMouseEvent): void {
    event.preventDefault();
    setMenu({ context: { kind: "pane" }, x: event.clientX, y: event.clientY });
  }

  const selectedObjects = useMemo(
    () =>
      data.objects.filter((object) =>
        selectedNodeIds.includes(object.objectId),
      ),
    [data.objects, selectedNodeIds],
  );

  const selectedRelations = useMemo(
    () =>
      data.relations.filter((relation) =>
        selectedEdgeIds.includes(relation.relationId),
      ),
    [data.relations, selectedEdgeIds],
  );

  const activeDimensionDefinition = useMemo(
    () => dimensionDefinition(activeDimension),
    [activeDimension],
  );

  function copySelection(): void {
    if (selectedObjects.length > 0) copyObjectsToClipboard(selectedObjects);
    setMenu(null);
  }

  async function createObject(
    fields: Readonly<Record<string, unknown>> = defaultDiagramObjectFields,
  ): Promise<void> {
    try {
      const existing = await context.viewClient.objects(
        context.workspaceId,
        context.objectType,
        0,
        100,
      );
      const knownIds = new Set(existing.items.map((object) => object.objectId));
      await createObjectByCommand(
        context.commandClient,
        context.viewClient,
        context.workspaceId,
        context.objectType,
        fields,
        "diagram-panel",
      );
      const objectId = await resolveCreatedDiagramObjectId({
        viewClient: context.viewClient,
        workspaceId: context.workspaceId,
        objectTypeCode: context.objectType,
        knownIds,
        expectedName:
          typeof fields.name === "string" ? fields.name.trim() : undefined,
      });
      if (objectId) {
        const optimisticObject = optimisticDiagramObject({
          objectId,
          objectType: context.objectType,
          fields,
        });
        setData((current) => {
          const next = {
            ...current,
            objects: current.objects.some(
              (object) => object.objectId === objectId,
            )
              ? current.objects.map((object) =>
                  object.objectId === objectId ? optimisticObject : object,
                )
              : [...current.objects, optimisticObject],
          };
          dataRef.current = next;
          return next;
        });
        setNodes((currentNodes) => {
          const next = upsertOptimisticDiagramNode({
            nodes: currentNodes,
            object: optimisticObject,
            activeDimension,
          });
          nodesRef.current = next;
          return next;
        });
      }
      await attachCreatedObjectToRoot({
        viewClient: context.viewClient,
        commandClient: context.commandClient,
        workspaceId: context.workspaceId,
        rootId: context.rootId,
        objectTypeCode: context.objectType,
        objectId,
      }).catch(() => {});
      context.refreshViews();
    } catch (error) {
      context.reportError(errorMessage(error, "新建对象失败"));
    } finally {
      setMenu(null);
    }
  }

  async function pasteClipboard(): Promise<void> {
    const clipboard = readDiagramClipboard();
    if (!clipboard) return;
    try {
      for (const object of clipboard.objects) {
        await createObjectByCommand(
          context.commandClient,
          context.viewClient,
          context.workspaceId,
          object.objectType,
          object.fields,
          "diagram-copy-paste",
        );
      }
      context.refreshViews();
    } catch (error) {
      context.reportError(errorMessage(error, "粘贴对象失败"));
    } finally {
      setMenu(null);
    }
  }

  async function duplicateSelection(): Promise<void> {
    copySelection();
    await pasteClipboard();
  }

  function removeRelationsFromCurrentDiagram(
    relationIds: readonly string[],
  ): void {
    setData((current) => {
      const next = {
        ...current,
        relations: removeDiagramRelationsLocally({
          relations: current.relations,
          edges: [],
          selectedEdgeIds: [],
          relationIds,
        }).relations,
      };
      dataRef.current = next;
      return next;
    });
    setEdges(
      (current) =>
        removeDiagramRelationsLocally({
          relations: [],
          edges: current,
          selectedEdgeIds: [],
          relationIds,
        }).edges as DiagramEdge[],
    );
    setSelectedEdgeIds(
      (current) =>
        removeDiagramRelationsLocally({
          relations: [],
          edges: [],
          selectedEdgeIds: current,
          relationIds,
        }).selectedEdgeIds,
    );
  }

  function refreshDiagramAfterRelationDeleted(): void {
    context.refreshViews();
    window.setTimeout(context.refreshViews, diagramRelationRefreshDelayMs);
  }

  async function deleteSelection(): Promise<void> {
    const contextEdgeId =
      menu?.context.kind === "edge" ? menu.context.edgeId : null;
    if (contextEdgeId) {
      const target = resolveEdgeDeletionTarget(
        contextEdgeId,
        dataRef.current.relations,
        edges,
      );
      if (!target) {
        toast.info("找不到该关系，请刷新后重试");
        setMenu(null);
        return;
      }
      try {
        await context.commandClient.unlink(
          context.workspaceId,
          target.relationId,
          target.version,
        );
        removeRelationsFromCurrentDiagram([target.relationId]);
        refreshDiagramAfterRelationDeleted();
        toast.success("连线已删除");
      } catch (error) {
        context.reportError(errorMessage(error, "删除关系失败"));
      } finally {
        setMenu(null);
      }
      return;
    }
    if (selectedObjects.length === 0 && selectedRelations.length === 0) return;
    try {
      const deletedRelationIds = selectedRelations.map(
        (relation) => relation.relationId,
      );
      await unlinkSelectedRelations(
        context.commandClient,
        context.workspaceId,
        selectedRelations,
      );
      for (const object of selectedObjects) {
        await softDeleteObjectByCommand(
          context.commandClient,
          context.workspaceId,
          object,
        );
      }
      removeRelationsFromCurrentDiagram(deletedRelationIds);
      clearSelection();
      refreshDiagramAfterRelationDeleted();
      toast.success("已删除选择");
    } catch (error) {
      context.reportError(errorMessage(error, "删除选择失败"));
    } finally {
      setMenu(null);
    }
  }

  function selectAll(): void {
    setSelectedNodeIds(nodes.map((node) => node.id));
    setSelectedEdgeIds(edges.map((edge) => edge.id));
    setMenu(null);
  }

  function clearSelection(): void {
    setSelectedObjectId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    context.selection.clear();
    setMenu(null);
  }

  function viewDetail(): void {
    const nodeId = menu?.context.kind === "node" ? menu.context.nodeId : null;
    if (nodeId)
      context.selection.select({ entityType: "object", entityId: nodeId });
    setMenu(null);
  }

  function runShortcut(shortcut: DiagramShortcut): void {
    if (shortcut === "clearSelection") clearSelection();
    if (shortcut === "copy") copySelection();
    if (shortcut === "delete") void deleteSelection();
    if (shortcut === "duplicate") void duplicateSelection();
    if (shortcut === "paste") void pasteClipboard();
    if (shortcut === "selectAll") selectAll();
  }

  function handleKeyDown(event: ReactKeyboardEvent): void {
    if (event.key === "Escape" && connectionMode) {
      event.preventDefault();
      setConnectionMode((current) => nextConnectionMode(current, "escape"));
      return;
    }
    const shortcut = diagramShortcutFromEvent(event.nativeEvent);
    if (!shortcut) return;
    event.preventDefault();
    runShortcut(shortcut);
  }

  async function connectObjects(connection: Connection): Promise<void> {
    if (!connectionMode) {
      toast.info("请先进入连线模式");
      return;
    }
    try {
      let endpoints = resolveDiagramConnectionEndpoints({
        objects: dataRef.current.objects,
        nodes: nodesRef.current,
        connection,
      });
      if (!endpoints) {
        const reloadedObjects = await loadDiagramObjects({
          viewClient: context.viewClient,
          workspaceId: context.workspaceId,
          templateCode: context.templateCode,
          objectType: context.objectType,
        });
        // E: 合并本地乐观对象(后端回读尚未返回的刚建对象),避免连线回读冲掉节点。
        const objects = mergeOptimisticDiagramObjects(
          reloadedObjects,
          dataRef.current.objects,
        );
        const reloadedRelations = await loadDiagramRelations({
          viewClient: context.viewClient,
          workspaceId: context.workspaceId,
          relationType: context.relationType,
          rootId: context.rootId,
          objects,
        });
        const relations = mergeOptimisticDiagramRelations(
          reloadedRelations,
          dataRef.current.relations,
        );
        const nextData = { objects, relations };
        dataRef.current = nextData;
        setData(nextData);
        endpoints = resolveDiagramConnectionEndpoints({
          objects,
          nodes: nodesRef.current,
          connection,
        });
      }
      const source = endpoints?.source ?? null;
      const target = endpoints?.target ?? null;
      if (!source || !target) {
        toast.info("对象未就绪，请稍候再连");
        return;
      }
      const inference = inferDiagramRelationType({
        relationTypes: await context.viewClient.relationTypes(
          context.workspaceId,
        ),
        sourceObjectType: source.objectType,
        targetObjectType: target.objectType,
      });
      if (inference.kind === "none") {
        toast.info("这两类对象之间没有可建的关系");
        return;
      }
      if (inference.kind === "ambiguous") {
        // TODO: 若后续同一对象类型对允许多种关系,在这里弹出关系类型选择器。
        toast.info("这两类对象之间有多个候选关系，暂不能自动建关系");
        return;
      }
      const oriented = inference.reversed
        ? { fromId: target.objectId, toId: source.objectId }
        : { fromId: source.objectId, toId: target.objectId };
      const rejection = diagramConnectionRejection({
        sourceId: oriented.fromId,
        targetId: oriented.toId,
        relationTypeCode: inference.relationTypeCode,
        relations: dataRef.current.relations,
      });
      if (rejection === "self") {
        toast.info("不能把对象连到它自己");
        return;
      }
      if (rejection === "duplicate") {
        toast.info("这两个对象之间已存在该关系");
        return;
      }
      // D: 用解析出的真实对象 id 建关系(而非 ReactFlow 的节点 id);
      // B: reversed 时已交换端点,保证关系方向正确。
      const connectResult = await connectDiagramObjectsInMode(
        context.commandClient,
        context.workspaceId,
        inference.relationTypeId,
        { ...connection, source: oriented.fromId, target: oriented.toId },
        connectionMode,
      );
      if (connectResult === "disabled") {
        toast.info("请先进入连线模式");
        return;
      }
      if (connectResult === "connected") {
        // A: 立即把新关系塞进 data.relations,连线即时显示,再由刷新对齐后端。
        const optimistic = optimisticDiagramRelation({
          relationType: inference.relationTypeCode,
          sourceId: oriented.fromId,
          targetId: oriented.toId,
        });
        setData((current) => {
          const next = {
            ...current,
            relations: [
              ...current.relations.filter(
                (relation) => relation.relationId !== optimistic.relationId,
              ),
              optimistic,
            ],
          };
          dataRef.current = next;
          return next;
        });
        refreshDiagramAfterRelationCreated({
          refreshViews: context.refreshViews,
          scheduleRefresh: (callback, delayMs) =>
            window.setTimeout(callback, delayMs),
        });
        setConnectionMode((current) =>
          nextConnectionMode(current, "connected"),
        );
      }
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "创建关系失败",
      );
    }
  }

  async function deleteRelations(deletedEdges: DiagramEdge[]): Promise<void> {
    try {
      await unlinkDiagramEdges(
        context.commandClient,
        context.workspaceId,
        deletedEdges,
      );
      removeRelationsFromCurrentDiagram(deletedEdges.map((edge) => edge.id));
      refreshDiagramAfterRelationDeleted();
      toast.success("连线已删除");
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "删除关系失败",
      );
    }
  }

  return (
    <section
      aria-label="图面板"
      className="diagram-panel"
      onKeyDown={handleKeyDown}
      ref={panelRef}
      tabIndex={0}
    >
      {connectionMode ? (
        <div className="diagram-connection-mode" role="status">
          连接模式: 请从节点端口拖拽到另一个图元，按 Esc 退出。
        </div>
      ) : null}
      {showDiagramDimensionControls ? (
        <>
          <div
            aria-label="维度"
            className="diagram-dimension-switcher"
            role="toolbar"
          >
            <span>维度:</span>
            <button
              aria-pressed={activeDimension === "all"}
              onClick={() => setActiveDimension("all")}
              type="button"
            >
              全部
            </button>
            {listDimensions().map((dimension) => (
              <button
                aria-pressed={activeDimension === dimension.id}
                className={`dimension-button-${dimension.id}`}
                key={dimension.id}
                onClick={() => setActiveDimension(dimension.id)}
                type="button"
              >
                {dimension.label}
              </button>
            ))}
          </div>
          <div
            className={[
              "diagram-dimension-legend",
              activeDimensionDefinition
                ? `diagram-dimension-legend-${activeDimensionDefinition.id}`
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="dimension-legend-ramp" aria-hidden="true" />
            <strong>{activeDimensionDefinition?.label ?? "全部"}</strong>
            <span>
              {activeDimensionDefinition?.description ?? "对象字段预览"}
            </span>
          </div>
        </>
      ) : null}
      <div className="diagram-grid-controls">
        <label>
          <input
            checked={gridEnabled}
            onChange={(event) => setGridEnabled(event.target.checked)}
            type="checkbox"
          />
          网格
        </label>
        <select
          aria-label="网格样式"
          disabled={!gridEnabled}
          onChange={(event) =>
            setGridVariant(event.target.value as BackgroundVariant)
          }
          value={gridVariant}
        >
          <option value={BackgroundVariant.Dots}>点</option>
          <option value={BackgroundVariant.Lines}>线</option>
        </select>
      </div>
      {selectedNodeIds.length > 1 ? (
        <div className="diagram-align-toolbar" role="toolbar">
          <button onClick={() => alignSelected("left")} title="左对齐">
            左
          </button>
          <button onClick={() => alignSelected("right")} title="右对齐">
            右
          </button>
          <button onClick={() => alignSelected("top")} title="顶对齐">
            顶
          </button>
          <button onClick={() => alignSelected("bottom")} title="底对齐">
            底
          </button>
          <button
            onClick={() => alignSelected("horizontalCenter")}
            title="水平居中"
          >
            中X
          </button>
          <button
            onClick={() => alignSelected("verticalCenter")}
            title="垂直居中"
          >
            中Y
          </button>
          <button
            onClick={() => distributeSelected("horizontal")}
            title="水平分布"
          >
            横分
          </button>
          <button
            onClick={() => distributeSelected("vertical")}
            title="垂直分布"
          >
            竖分
          </button>
        </div>
      ) : null}
      <ReactFlow
        deleteKeyCode={["Backspace", "Delete"]}
        edgeTypes={edgeTypes}
        edges={edges}
        fitView
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable
        onConnect={(connection) => void connectObjects(connection)}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgesDelete={(deletedEdges) => void deleteRelations(deletedEdges)}
        onEdgesChange={onEdgesChange}
        onNodeContextMenu={onNodeContextMenu}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={clearGuides}
        onNodesChange={onNodesChange}
        onPaneContextMenu={openPaneMenu}
        onSelectionChange={onSelectionChange}
        selectNodesOnDrag
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
        snapGrid={snapGrid}
        snapToGrid={gridEnabled}
      >
        {gridEnabled ? (
          <Background gap={snapGrid} variant={gridVariant} />
        ) : null}
        <SmartGuidesOverlay guides={guides} />
        <Controls />
      </ReactFlow>
      {menu ? (
        <DiagramContextMenu
          canPaste={hasDiagramClipboard()}
          menu={menu}
          onClose={() => setMenu(null)}
          onCopy={copySelection}
          onCreateObject={() => void createObject()}
          onDelete={() => void deleteSelection()}
          onDuplicate={() => void duplicateSelection()}
          onPaste={() => void pasteClipboard()}
          onSelectAll={selectAll}
          onViewDetail={viewDetail}
        />
      ) : null}
      {lineageTarget ? (
        <LineageView
          fieldCode={lineageTarget.fieldCode}
          object={lineageTarget.object}
          onClose={() => setLineageTarget(null)}
          viewClient={context.viewClient}
          workspaceId={context.workspaceId}
        />
      ) : null}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
