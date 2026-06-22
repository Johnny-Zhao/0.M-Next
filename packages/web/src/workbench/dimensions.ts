export type DimensionId = string;
export type ActiveDimensionId = DimensionId | "all";

export interface DimensionDefinition {
  readonly id: DimensionId;
  readonly label: string;
  readonly description: string;
  readonly match: (code: string) => boolean;
}

export interface DimensionField {
  readonly code: string;
  readonly value: unknown;
}

// TODO(view-API): this is a temporary frontend naming convention.
// The formal dimension source is the metamodel `dimension` tag plus view-API.
// Keep callers depending on DimensionId so the convention can be replaced
// without changing the diagram overlay contract.
const builtInDimensions: readonly DimensionDefinition[] = [
  {
    id: "energy",
    label: "能量",
    description: "能量、SOC、余量、电压、电流和功率字段",
    match: (code) =>
      /^energy[_-]/i.test(code) ||
      /能量|电量|电压|电流|功率|soc|余量|battery|power|voltage|current/i.test(
        code,
      ),
  },
  {
    id: "thermal",
    label: "热",
    description: "热、温度、散热和冷却字段",
    match: (code) =>
      /^thermal[_-]/i.test(code) ||
      /热|温度|散热|冷却|temperature|temp|cooling|heat/i.test(code),
  },
  {
    id: "mass",
    label: "质量",
    description: "质量、重量、载荷和重心字段",
    match: (code) =>
      /^mass[_-]/i.test(code) ||
      /质量|重量|载荷|重心|weight|payload|kg|center[_-]?of[_-]?gravity/i.test(
        code,
      ),
  },
];

const dimensions = new Map<DimensionId, DimensionDefinition>();

resetDimensions();

export function registerDimension(definition: DimensionDefinition): void {
  dimensions.delete(definition.id);
  dimensions.set(definition.id, definition);
}

export function unregisterDimension(id: string): void {
  dimensions.delete(id);
}

export function listDimensions(): readonly DimensionDefinition[] {
  return [...dimensions.values()];
}

export function resetDimensions(): void {
  dimensions.clear();
  builtInDimensions.forEach((dimension) =>
    dimensions.set(dimension.id, dimension),
  );
}

export const DIMENSIONS: readonly DimensionDefinition[] = builtInDimensions;

export function fieldDimension(code: string): DimensionId | null {
  return (
    listDimensions().find((dimension) => dimension.match(code))?.id ?? null
  );
}

export function groupByDimension(
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, readonly DimensionField[]>> {
  const grouped: Record<string, DimensionField[]> = Object.fromEntries(
    listDimensions().map((dimension) => [dimension.id, []]),
  );

  for (const [code, value] of Object.entries(fields)) {
    const dimension = fieldDimension(code);
    if (dimension) grouped[dimension].push({ code, value });
  }

  return grouped;
}
