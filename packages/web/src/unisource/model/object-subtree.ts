import type { DataObject, DataRelation } from "./kernel";

const terminalStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export interface ObjectSubtreeWorkspace {
  readonly objects: readonly DataObject[];
  readonly relations: readonly DataRelation[];
}

export interface ObjectSubtree {
  readonly objectIds: ReadonlySet<string>;
  readonly relationIds: ReadonlySet<string>;
}

export function traverseObjectSubtree(
  workspace: ObjectSubtreeWorkspace,
  rootObjectId: string,
  relationTypeCodes: readonly string[],
  depth: number,
): ObjectSubtree | null {
  const objects = activeObjectsById(workspace.objects);
  if (!objects.has(rootObjectId)) return null;
  const relationTypes = new Set(relationTypeCodes);
  const objectIds = new Set([rootObjectId]);
  const relationIds = new Set<string>();
  let frontier = [rootObjectId];
  for (
    let level = 0;
    level < boundedSubtreeDepth(depth) && frontier.length;
    level += 1
  ) {
    const next: string[] = [];
    for (const relation of workspace.relations) {
      if (
        relation.status !== "active" ||
        !relationTypes.has(relation.relationTypeCode) ||
        !frontier.includes(relation.sourceId) ||
        !objects.has(relation.targetId)
      ) {
        continue;
      }
      relationIds.add(relation.id);
      if (!objectIds.has(relation.targetId)) next.push(relation.targetId);
      objectIds.add(relation.targetId);
    }
    frontier = next;
  }
  return { objectIds, relationIds };
}

export function resolveUniqueSubtreeRoot(
  workspace: ObjectSubtreeWorkspace,
  objectId: string,
  rootObjectTypeCode: string,
  relationTypeCodes: readonly string[],
  depth: number,
): string | null {
  const objects = activeObjectsById(workspace.objects);
  const selected = objects.get(objectId);
  if (!selected) return null;
  if (selected.objectTypeCode === rootObjectTypeCode) return selected.id;
  const relationTypes = new Set(relationTypeCodes);
  const candidates = new Set<string>();
  let frontier = [selected.id];
  for (
    let level = 0;
    level < boundedSubtreeDepth(depth) && frontier.length;
    level += 1
  ) {
    const next: string[] = [];
    for (const relation of workspace.relations) {
      if (
        relation.status !== "active" ||
        !relationTypes.has(relation.relationTypeCode) ||
        !frontier.includes(relation.targetId) ||
        !objects.has(relation.sourceId)
      ) {
        continue;
      }
      const source = objects.get(relation.sourceId)!;
      if (source.objectTypeCode === rootObjectTypeCode)
        candidates.add(source.id);
      else next.push(source.id);
    }
    frontier = next;
  }
  return candidates.size === 1 ? Array.from(candidates)[0]! : null;
}

export function boundedSubtreeDepth(value: number): number {
  return Math.min(
    5,
    Math.max(1, Number.isFinite(value) ? Math.trunc(value) : 1),
  );
}

function activeObjectsById(
  objects: readonly DataObject[],
): ReadonlyMap<string, DataObject> {
  return new Map(
    objects
      .filter((object) => !terminalStatuses.has(object.status))
      .map((object) => [object.id, object]),
  );
}
