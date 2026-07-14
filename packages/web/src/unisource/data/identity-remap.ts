import type { DataObject, DataRelation, FieldCode } from "../model/kernel";
import type { SimEvent, SimScenario, SlotBinding } from "../model/view-layer";
import type { DemoSeed } from "../seed/demo-seed";

export interface IdentityRemapReport {
  readonly matchedObjects: number;
  readonly unmatchedRefs: number;
  readonly matchedRelations: number;
  readonly unmatchedRelations: number;
}

export interface IdentityRemapResult {
  readonly seed: DemoSeed;
  readonly report: IdentityRemapReport;
}

export interface PresentationObjectBinding {
  readonly presentationId: string;
  readonly objectTypeCode: string;
  readonly fields: Readonly<Partial<Record<"code" | "sku" | "name", string>>>;
}

export interface PresentationRelationBinding {
  readonly presentationId: string;
  readonly relationTypeCode: string;
  readonly sourceId: string;
  readonly targetId: string;
}

export function remapSeedPresentation(params: {
  readonly seed: DemoSeed;
  readonly kernelObjects: readonly DataObject[];
  readonly kernelRelations: readonly DataRelation[];
  readonly objectBindings?: readonly PresentationObjectBinding[];
  readonly relationBindings?: readonly PresentationRelationBinding[];
}): IdentityRemapResult {
  const objectBindings =
    params.objectBindings ?? params.seed.objects.map(toPresentationBinding);
  const relationBindings =
    params.relationBindings ?? params.seed.relations.map(toRelationBinding);
  const objectMap = buildObjectIdMap(objectBindings, params.kernelObjects);
  const relationMap = buildRelationIdMap({
    seedObjects: objectBindings,
    kernelObjects: params.kernelObjects,
    seedRelations: relationBindings,
    kernelRelations: params.kernelRelations,
  });
  const counter = { unmatchedRefs: 0 };
  const seed: DemoSeed = {
    ...params.seed,
    fieldRefs: params.seed.fieldRefs.map((ref) => {
      const objectId = objectMap.get(ref.objectId);
      if (!objectId) {
        counter.unmatchedRefs += 1;
        return { ...ref, state: "dangling" };
      }
      return { ...ref, objectId };
    }),
    views: params.seed.views.map((view) => ({
      ...view,
      config: remapConfig(view.config, objectMap, relationMap, counter),
    })),
    docModels: params.seed.docModels.map((doc) => ({
      ...doc,
      binding: remapDocBinding(doc.binding, objectMap, counter),
    })),
    slotBindings: params.seed.slotBindings.map((binding) =>
      remapSlotBinding(binding, objectMap, counter),
    ),
    simScenarios: params.seed.simScenarios.map((scenario) =>
      remapSimScenario(scenario, objectMap, relationMap, counter),
    ),
  };
  return {
    seed,
    report: {
      matchedObjects: objectMap.size,
      unmatchedRefs: counter.unmatchedRefs,
      matchedRelations: relationMap.size,
      unmatchedRelations: relationBindings.length - relationMap.size,
    },
  };
}

export function objectBusinessKey(object: DataObject): string | null {
  for (const fieldCode of ["code", "sku", "name"] as const) {
    const value = readBusinessValue(object, fieldCode);
    if (value) return `${object.objectTypeCode}:${fieldCode}:${value}`;
  }
  return null;
}

export function relationBusinessKey(
  relation: DataRelation,
  objectsById: ReadonlyMap<string, DataObject>,
): string | null {
  const source = objectsById.get(relation.sourceId);
  const target = objectsById.get(relation.targetId);
  const sourceKey = source ? objectBusinessKey(source) : null;
  const targetKey = target ? objectBusinessKey(target) : null;
  return sourceKey && targetKey
    ? `${relation.relationTypeCode}:${sourceKey}->${targetKey}`
    : null;
}

function buildObjectIdMap(
  seedObjects: readonly PresentationObjectBinding[],
  kernelObjects: readonly DataObject[],
): ReadonlyMap<string, string> {
  const kernelByKey = new Map<string, DataObject>();
  for (const object of kernelObjects) {
    const key = objectBusinessKey(object);
    if (key) kernelByKey.set(key, object);
  }
  const result = new Map<string, string>();
  for (const object of seedObjects) {
    const key = bindingBusinessKey(object);
    const kernelObject = key ? kernelByKey.get(key) : undefined;
    if (kernelObject) result.set(object.presentationId, kernelObject.id);
  }
  return result;
}

function buildRelationIdMap(params: {
  readonly seedObjects: readonly PresentationObjectBinding[];
  readonly kernelObjects: readonly DataObject[];
  readonly seedRelations: readonly PresentationRelationBinding[];
  readonly kernelRelations: readonly DataRelation[];
}): ReadonlyMap<string, string> {
  const seedObjectsById = new Map(
    params.seedObjects.map((object) => [object.presentationId, object]),
  );
  const kernelObjectsById = byId(params.kernelObjects);
  const kernelByKey = new Map<string, DataRelation>();
  for (const relation of params.kernelRelations) {
    const key = relationBusinessKey(relation, kernelObjectsById);
    if (key) kernelByKey.set(key, relation);
  }
  const result = new Map<string, string>();
  for (const relation of params.seedRelations) {
    const source = seedObjectsById.get(relation.sourceId);
    const target = seedObjectsById.get(relation.targetId);
    const sourceKey = source ? bindingBusinessKey(source) : null;
    const targetKey = target ? bindingBusinessKey(target) : null;
    const key =
      sourceKey && targetKey
        ? `${relation.relationTypeCode}:${sourceKey}->${targetKey}`
        : null;
    const kernelRelation = key ? kernelByKey.get(key) : undefined;
    if (kernelRelation) result.set(relation.presentationId, kernelRelation.id);
  }
  return result;
}

function remapSlotBinding(
  binding: SlotBinding,
  objectMap: ReadonlyMap<string, string>,
  counter: { unmatchedRefs: number },
): SlotBinding {
  if (!binding.objectId) return binding;
  const objectId = objectMap.get(binding.objectId);
  if (!objectId) {
    counter.unmatchedRefs += 1;
    return { ...binding, objectId: null, state: "dangling" };
  }
  return { ...binding, objectId, state: "fresh" };
}

function remapDocBinding(
  binding: { readonly objectId: string },
  objectMap: ReadonlyMap<string, string>,
  counter: { unmatchedRefs: number },
): { readonly objectId: string; readonly state: "fresh" | "dangling" } {
  const objectId = objectMap.get(binding.objectId);
  if (!objectId) {
    counter.unmatchedRefs += 1;
    return { ...binding, state: "dangling" };
  }
  return { objectId, state: "fresh" };
}

function remapSimScenario(
  scenario: SimScenario,
  objectMap: ReadonlyMap<string, string>,
  relationMap: ReadonlyMap<string, string>,
  counter: { unmatchedRefs: number },
): SimScenario {
  return {
    ...scenario,
    events: scenario.events.map((event) =>
      remapSimEvent(event, objectMap, relationMap, counter),
    ),
  };
}

function remapSimEvent(
  event: SimEvent,
  objectMap: ReadonlyMap<string, string>,
  relationMap: ReadonlyMap<string, string>,
  counter: { unmatchedRefs: number },
): SimEvent {
  const nodeObjectId = objectMap.get(event.nodeObjectId);
  if (!nodeObjectId) counter.unmatchedRefs += 1;
  const viaRelationId = event.viaRelationId
    ? relationMap.get(event.viaRelationId)
    : undefined;
  if (event.viaRelationId && !viaRelationId) counter.unmatchedRefs += 1;
  return {
    ...event,
    nodeObjectId: nodeObjectId ?? event.nodeObjectId,
    state:
      nodeObjectId && (!event.viaRelationId || viaRelationId)
        ? "fresh"
        : "dangling",
    ...(event.viaRelationId ? { viaRelationId } : {}),
  };
}

function remapConfig(
  config: Record<string, unknown>,
  objectMap: ReadonlyMap<string, string>,
  relationMap: ReadonlyMap<string, string>,
  counter: { unmatchedRefs: number },
): Record<string, unknown> {
  const nodes = Array.isArray(config.nodes)
    ? config.nodes.map((node) => remapCanvasNode(node, objectMap, counter))
    : config.nodes;
  const edges = Array.isArray(config.edges)
    ? config.edges.map((edge) => remapCanvasEdge(edge, relationMap, counter))
    : config.edges;
  return { ...config, nodes, edges };
}

function remapCanvasNode(
  node: unknown,
  objectMap: ReadonlyMap<string, string>,
  counter: { unmatchedRefs: number },
): unknown {
  if (!isRecord(node) || typeof node.objectId !== "string") return node;
  const objectId = objectMap.get(node.objectId);
  if (!objectId) {
    counter.unmatchedRefs += 1;
    return { ...node, state: "dangling" };
  }
  return { ...node, objectId, state: "fresh" };
}

function remapCanvasEdge(
  edge: unknown,
  relationMap: ReadonlyMap<string, string>,
  counter: { unmatchedRefs: number },
): unknown {
  if (!isRecord(edge) || typeof edge.relationId !== "string") return edge;
  const relationId = relationMap.get(edge.relationId);
  if (!relationId) {
    counter.unmatchedRefs += 1;
    return { ...edge, state: "dangling" };
  }
  return { ...edge, relationId, state: "fresh" };
}

function readBusinessValue(
  object: DataObject,
  fieldCode: FieldCode,
): string | null {
  const value = object.fields[fieldCode]?.value;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
}

function bindingBusinessKey(binding: PresentationObjectBinding): string | null {
  for (const fieldCode of ["code", "sku", "name"] as const) {
    const value = binding.fields[fieldCode]?.trim();
    if (value) return `${binding.objectTypeCode}:${fieldCode}:${value}`;
  }
  return null;
}

function toPresentationBinding(object: DataObject): PresentationObjectBinding {
  return {
    presentationId: object.id,
    objectTypeCode: object.objectTypeCode,
    fields: Object.fromEntries(
      ["code", "sku", "name"].flatMap((fieldCode) => {
        const value = readBusinessValue(object, fieldCode);
        return value ? [[fieldCode, value]] : [];
      }),
    ),
  };
}

function toRelationBinding(
  relation: DataRelation,
): PresentationRelationBinding {
  return {
    presentationId: relation.id,
    relationTypeCode: relation.relationTypeCode,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
  };
}

function byId(objects: readonly DataObject[]): ReadonlyMap<string, DataObject> {
  return new Map(objects.map((object) => [object.id, object]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
