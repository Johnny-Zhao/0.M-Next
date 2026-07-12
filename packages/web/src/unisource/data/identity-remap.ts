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

export function remapSeedPresentation(params: {
  readonly seed: DemoSeed;
  readonly kernelObjects: readonly DataObject[];
  readonly kernelRelations: readonly DataRelation[];
}): IdentityRemapResult {
  const objectMap = buildObjectIdMap(params.seed.objects, params.kernelObjects);
  const relationMap = buildRelationIdMap({
    seedObjects: params.seed.objects,
    kernelObjects: params.kernelObjects,
    seedRelations: params.seed.relations,
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
      binding: {
        objectId: objectMap.get(doc.binding.objectId) ?? doc.binding.objectId,
      },
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
      unmatchedRelations: params.seed.relations.length - relationMap.size,
    },
  };
}

export function objectBusinessKey(object: DataObject): string | null {
  const label = readBusinessValue(object, "name");
  return label ? `${object.objectTypeCode}:${label}` : null;
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
  seedObjects: readonly DataObject[],
  kernelObjects: readonly DataObject[],
): ReadonlyMap<string, string> {
  const kernelByKey = new Map<string, DataObject>();
  for (const object of kernelObjects) {
    const key = objectBusinessKey(object);
    if (key) kernelByKey.set(key, object);
  }
  const result = new Map<string, string>();
  for (const object of seedObjects) {
    const key = objectBusinessKey(object);
    const kernelObject = key ? kernelByKey.get(key) : undefined;
    if (kernelObject) result.set(object.id, kernelObject.id);
  }
  return result;
}

function buildRelationIdMap(params: {
  readonly seedObjects: readonly DataObject[];
  readonly kernelObjects: readonly DataObject[];
  readonly seedRelations: readonly DataRelation[];
  readonly kernelRelations: readonly DataRelation[];
}): ReadonlyMap<string, string> {
  const seedObjectsById = byId(params.seedObjects);
  const kernelObjectsById = byId(params.kernelObjects);
  const kernelByKey = new Map<string, DataRelation>();
  for (const relation of params.kernelRelations) {
    const key = relationBusinessKey(relation, kernelObjectsById);
    if (key) kernelByKey.set(key, relation);
  }
  const result = new Map<string, string>();
  for (const relation of params.seedRelations) {
    const key = relationBusinessKey(relation, seedObjectsById);
    const kernelRelation = key ? kernelByKey.get(key) : undefined;
    if (kernelRelation) result.set(relation.id, kernelRelation.id);
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
    return { ...binding, objectId: null };
  }
  return { ...binding, objectId };
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
    return node;
  }
  return { ...node, objectId };
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
    return edge;
  }
  return { ...edge, relationId };
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

function byId(objects: readonly DataObject[]): ReadonlyMap<string, DataObject> {
  return new Map(objects.map((object) => [object.id, object]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
