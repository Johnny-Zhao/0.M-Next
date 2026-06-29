import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";

import {
  TimePlayhead,
  nearestSeriesPoint,
  seriesDomain,
  type RelationSummary,
  type RuleStatus,
  type SimResultSeriesPoint,
  type SimRunSummary,
  type TimeOption,
  type ViewObject,
} from "@m-next/views";

import { listDimensions, type DimensionDefinition } from "./dimensions";
import { objectDerivedChips, objectTitle } from "./diagram-panel";
import { LineageView } from "./lineage-view";
import { FxChip, RuleLamp } from "./widgets";
import { useWorkbenchContext } from "./workbench";

export type FloorplanDimensionId = "all" | "light" | "thermal" | "wind";
export type FloorplanTone = "ok" | "warn" | "block" | "normal" | "empty";
export type FloorplanHeatTone = "low" | "mid" | "high" | "flat";

export interface FloorplanDimensionOption {
  readonly id: FloorplanDimensionId;
  readonly label: string;
  readonly description: string;
  readonly match: (code: string) => boolean;
}

export interface FloorplanRoomBlock {
  readonly id: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly areaChip: FloorplanAreaChip | null;
  readonly tone: FloorplanTone;
  readonly selected: boolean;
  readonly object: ViewObject;
}

export type FloorplanLayoutMode = "coordinate" | "fallback";

export interface FloorplanAreaChip {
  readonly fieldCode: string;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

interface FloorplanData {
  readonly objects: readonly ViewObject[];
  readonly relations: readonly RelationSummary[];
}

interface LineageTarget {
  readonly object: ViewObject;
  readonly fieldCode: string;
}

interface FloorplanRoomStyle extends CSSProperties {
  readonly "--floorplan-x": string;
  readonly "--floorplan-y": string;
  readonly "--floorplan-w": string;
  readonly "--floorplan-h": string;
}

const floorplanInset = 20;
const floorplanGap = 14;
const floorplanRowWidth = 780;
const roomScale = 34;
const roomMinWidth = 108;
const roomMinHeight = 78;
const roomMaxWidth = 230;
const roomMaxHeight = 172;
const timeSeriesPageSize = 240;
const timeSeriesDownsample = 4;
const playbackTickMs = 280;

const fallbackDimensions: readonly FloorplanDimensionOption[] = [
  {
    id: "light",
    label: "光",
    description: "采光、照度和窗地比",
    match: (code) => /^light[_-]|采光|照度|lux|window_floor_ratio/i.test(code),
  },
  {
    id: "thermal",
    label: "热",
    description: "温度、围护和热负荷",
    match: (code) =>
      /^thermal[_-]|温度|散热|热|temperature|temp|heat/i.test(code),
  },
  {
    id: "wind",
    label: "风",
    description: "通风、换气和 ACH",
    match: (code) => /^wind[_-]|通风|换气|ach/i.test(code),
  },
];

export function floorplanDimensionOptions(): readonly FloorplanDimensionOption[] {
  const registered = new Map<string, DimensionDefinition>(
    listDimensions().map((dimension) => [dimension.id, dimension]),
  );
  return [
    {
      id: "all",
      label: "全部",
      description: "按规则状态综合着色",
      match: () => true,
    },
    ...fallbackDimensions.map((fallback) => {
      const dimension = registered.get(fallback.id);
      return dimension
        ? {
            id: fallback.id,
            label: dimension.label,
            description: dimension.description,
            match: dimension.match,
          }
        : fallback;
    }),
  ];
}

export function buildFloorplanRooms(
  objects: readonly ViewObject[],
  relations: readonly RelationSummary[],
  selectedObjectId: string | null,
  activeDimension: FloorplanDimensionId,
): {
  readonly rooms: readonly FloorplanRoomBlock[];
  readonly width: number;
  readonly height: number;
  readonly mode: FloorplanLayoutMode;
} {
  const ordered = orderRoomsByAdjacency(objects, relations);
  const coordinateLayout = buildCoordinateFloorplanRooms(
    ordered,
    selectedObjectId,
    activeDimension,
  );
  if (coordinateLayout) return coordinateLayout;
  const options = floorplanDimensionOptions();
  const activeOption = options.find((option) => option.id === activeDimension);
  let x = floorplanInset;
  let y = floorplanInset + 44;
  let rowHeight = 0;
  let canvasWidth = floorplanRowWidth;

  const rooms = ordered.map((object) => {
    const size = roomSize(object);
    if (x > floorplanInset && x + size.width > floorplanRowWidth) {
      x = floorplanInset;
      y += rowHeight + floorplanGap;
      rowHeight = 0;
    }
    const block: FloorplanRoomBlock = {
      id: object.objectId,
      title: objectTitle(object),
      x,
      y,
      width: size.width,
      height: size.height,
      areaChip: areaChip(object),
      tone: floorplanTone(object, activeOption),
      selected: object.objectId === selectedObjectId,
      object,
    };
    x += size.width + floorplanGap;
    rowHeight = Math.max(rowHeight, size.height);
    canvasWidth = Math.max(canvasWidth, x + floorplanInset);
    return block;
  });

  return {
    rooms,
    width: canvasWidth,
    height: Math.max(240, y + rowHeight + floorplanInset),
    mode: "fallback",
  };
}

function buildCoordinateFloorplanRooms(
  objects: readonly ViewObject[],
  selectedObjectId: string | null,
  activeDimension: FloorplanDimensionId,
): {
  readonly rooms: readonly FloorplanRoomBlock[];
  readonly width: number;
  readonly height: number;
  readonly mode: FloorplanLayoutMode;
} | null {
  if (objects.length === 0) return null;
  const coordinates = objects.map(planCoordinate);
  if (coordinates.some((coordinate) => coordinate === null)) return null;

  const typedCoordinates = coordinates as readonly PlanCoordinate[];
  const minX = Math.min(...typedCoordinates.map((coordinate) => coordinate.x));
  const minY = Math.min(...typedCoordinates.map((coordinate) => coordinate.y));
  const maxX = Math.max(
    ...typedCoordinates.map((coordinate) => coordinate.x + coordinate.length),
  );
  const maxY = Math.max(
    ...typedCoordinates.map((coordinate) => coordinate.y + coordinate.width),
  );
  const scale = 56;
  const planWidth = Math.max(1, maxX - minX);
  const planHeight = Math.max(1, maxY - minY);
  const options = floorplanDimensionOptions();
  const activeOption = options.find((option) => option.id === activeDimension);

  return {
    rooms: typedCoordinates.map((coordinate) => ({
      id: coordinate.object.objectId,
      title: objectTitle(coordinate.object),
      x: floorplanInset + Math.round((coordinate.x - minX) * scale),
      y:
        floorplanInset +
        Math.round((maxY - coordinate.y - coordinate.width) * scale),
      width: Math.round(coordinate.length * scale),
      height: Math.round(coordinate.width * scale),
      areaChip: areaChip(coordinate.object),
      tone: floorplanTone(coordinate.object, activeOption),
      selected: coordinate.object.objectId === selectedObjectId,
      object: coordinate.object,
    })),
    width: Math.max(360, Math.round(planWidth * scale) + floorplanInset * 2),
    height: Math.max(240, Math.round(planHeight * scale) + floorplanInset * 2),
    mode: "coordinate",
  };
}

interface PlanCoordinate {
  readonly object: ViewObject;
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly width: number;
}

function planCoordinate(object: ViewObject): PlanCoordinate | null {
  const x = positiveOrZeroNumber(object.fields.plan_x);
  const y = positiveOrZeroNumber(object.fields.plan_y);
  const length = positiveNumber(object.fields.length_m);
  const width = positiveNumber(object.fields.width_m);
  if (
    x === undefined ||
    y === undefined ||
    length === undefined ||
    width === undefined
  ) {
    return null;
  }
  return { object, x, y, length, width };
}

function orderRoomsByAdjacency(
  objects: readonly ViewObject[],
  relations: readonly RelationSummary[],
): readonly ViewObject[] {
  const byId = new Map(objects.map((object) => [object.objectId, object]));
  const graph = new Map<string, Set<string>>();
  objects.forEach((object) => graph.set(object.objectId, new Set()));
  relations.forEach((relation) => {
    if (!byId.has(relation.sourceId) || !byId.has(relation.targetId)) return;
    graph.get(relation.sourceId)?.add(relation.targetId);
    graph.get(relation.targetId)?.add(relation.sourceId);
  });
  const unvisited = new Set(objects.map((object) => object.objectId));
  const ordered: ViewObject[] = [];

  while (unvisited.size > 0) {
    const start = [...unvisited].sort((left, right) =>
      compareRoomIds(left, right, byId, graph),
    )[0];
    if (!start) break;
    const queue = [start];
    unvisited.delete(start);
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) continue;
      const object = byId.get(id);
      if (object) ordered.push(object);
      const neighbors = [...(graph.get(id) ?? [])]
        .filter((neighbor) => unvisited.has(neighbor))
        .sort((left, right) => compareRoomIds(left, right, byId, graph));
      neighbors.forEach((neighbor) => {
        unvisited.delete(neighbor);
        queue.push(neighbor);
      });
    }
  }
  return ordered;
}

function compareRoomIds(
  left: string,
  right: string,
  byId: ReadonlyMap<string, ViewObject>,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const degreeDelta =
    (graph.get(right)?.size ?? 0) - (graph.get(left)?.size ?? 0);
  if (degreeDelta !== 0) return degreeDelta;
  const leftTitle = byId.get(left) ? objectTitle(byId.get(left)!) : left;
  const rightTitle = byId.get(right) ? objectTitle(byId.get(right)!) : right;
  return leftTitle.localeCompare(rightTitle, "zh-Hans-CN");
}

function roomSize(object: ViewObject): {
  readonly width: number;
  readonly height: number;
} {
  const length = positiveNumber(object.fields.length_m) ?? 3.2;
  const width = positiveNumber(object.fields.width_m) ?? 2.8;
  return {
    width: clamp(Math.round(length * roomScale), roomMinWidth, roomMaxWidth),
    height: clamp(Math.round(width * roomScale), roomMinHeight, roomMaxHeight),
  };
}

function areaChip(object: ViewObject): FloorplanAreaChip | null {
  const areaChip = objectDerivedChips(object).find(
    (chip) => chip.label === "面积",
  );
  if (areaChip) return areaChip;
  const length = positiveNumber(object.fields.length_m);
  const width = positiveNumber(object.fields.width_m);
  if (length === undefined || width === undefined) return null;
  return {
    fieldCode: "area_fx",
    label: "面积",
    value: formatNumber(length * width, 2),
    unit: "㎡",
  };
}

function floorplanTone(
  object: ViewObject,
  dimension: FloorplanDimensionOption | undefined,
): FloorplanTone {
  if (!dimension || dimension.id === "all") return ruleTone(object.ruleStatus);
  const matchingValues = Object.entries({
    ...object.fields,
    ...(object.derived ?? {}),
  }).filter(([code]) => dimension.match(code));
  if (matchingValues.length === 0) return "empty";

  if (dimension.id === "light") {
    const daylight = firstNumber(matchingValues, "light_df");
    if (daylight !== undefined) return daylight < 2 ? "block" : "ok";
    const ratio = firstNumber(matchingValues, "window_floor_ratio_fx");
    if (ratio !== undefined) return ratio < 0.14 ? "warn" : "ok";
  }
  if (dimension.id === "thermal") {
    const temperature = firstNumber(matchingValues, "thermal_temp");
    if (temperature !== undefined) {
      return temperature < 18 || temperature > 26 ? "warn" : "ok";
    }
  }
  if (dimension.id === "wind") {
    const ach = firstNumber(matchingValues, "wind_ach");
    if (ach !== undefined) return ach < 1 ? "warn" : "ok";
  }
  return ruleTone(object.ruleStatus);
}

function firstNumber(
  entries: readonly (readonly [string, unknown])[],
  code: string,
): number | undefined {
  return positiveOrZeroNumber(
    entries.find(([fieldCode]) => fieldCode === code)?.[1],
  );
}

function positiveNumber(value: unknown): number | undefined {
  const numeric = positiveOrZeroNumber(value);
  return numeric !== undefined && numeric > 0 ? numeric : undefined;
}

function positiveOrZeroNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function ruleTone(status: RuleStatus): FloorplanTone {
  if (status === "OK") return "ok";
  if (status === "WARN") return "warn";
  if (status === "BLOCK") return "block";
  return "normal";
}

export function floorplanHeatTone(
  value: number | null | undefined,
  min: number,
  max: number,
): FloorplanHeatTone | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return "flat";
  }
  const ratio = (value - min) / (max - min);
  if (ratio < 0.34) return "low";
  if (ratio < 0.67) return "mid";
  return "high";
}

function numericFieldOptions(
  object: ViewObject | undefined,
): readonly TimeOption[] {
  if (!object) return [];
  const values = { ...object.fields, ...(object.derived ?? {}) };
  return Object.entries(values)
    .filter(([, value]) => positiveOrZeroNumber(value) !== undefined)
    .map(([code]) => ({ id: code, label: code }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function valueDomain(
  points: readonly SimResultSeriesPoint[],
): { readonly min: number; readonly max: number } | null {
  const values = points
    .map((point) => point.value)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function formatSeriesValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "无值";
  }
  return formatNumber(value, 2);
}

export function FloorplanPanel(): ReactElement {
  const context = useWorkbenchContext();
  const {
    refreshVersion,
    reportError,
    rootId,
    selection,
    viewClient,
    workspaceId,
  } = context;
  const [data, setData] = useState<FloorplanData>({
    objects: [],
    relations: [],
  });
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeDimension, setActiveDimension] =
    useState<FloorplanDimensionId>("all");
  const [lineageTarget, setLineageTarget] = useState<LineageTarget | null>(
    null,
  );
  const [simRuns, setSimRuns] = useState<readonly SimRunSummary[]>([]);
  const [simRunsLoading, setSimRunsLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [timeObjectId, setTimeObjectId] = useState("");
  const [timeFieldCode, setTimeFieldCode] = useState("");
  const [seriesPoints, setSeriesPoints] = useState<
    readonly SimResultSeriesPoint[]
  >([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(
    () =>
      selection.subscribe((selected) => {
        setSelectedObjectId(
          selected?.entityType === "object" ? selected.entityId : null,
        );
      }),
    [selection],
  );

  useEffect(() => {
    let disposed = false;
    async function load(): Promise<void> {
      try {
        const page = await viewClient.objects(workspaceId, "room", 0, 100);
        const sourceId = rootId || page.items[0]?.objectId;
        const relations = sourceId
          ? await viewClient.relations(
              workspaceId,
              "adjacent",
              "out",
              sourceId,
              2,
            )
          : [];
        if (!disposed) setData({ objects: page.items, relations });
      } catch (error) {
        if (!disposed) {
          reportError(
            error instanceof Error ? error.message : "读取平面图失败",
          );
          setData({ objects: [], relations: [] });
        }
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [refreshVersion, reportError, rootId, viewClient, workspaceId]);

  useEffect(() => {
    let disposed = false;
    setSimRunsLoading(true);
    void viewClient
      .simRuns(workspaceId, 0, 20)
      .then((page) => {
        if (disposed) return;
        setSimRuns(page.items);
        setSelectedRunId((current) =>
          current && page.items.some((run) => run.runId === current)
            ? current
            : (page.items[0]?.runId ?? ""),
        );
      })
      .catch((error) => {
        if (disposed) return;
        reportError(
          error instanceof Error ? error.message : "读取仿真运行失败",
        );
        setSimRuns([]);
        setSelectedRunId("");
      })
      .finally(() => {
        if (!disposed) setSimRunsLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [refreshVersion, reportError, viewClient, workspaceId]);

  const objectOptions = useMemo<readonly TimeOption[]>(
    () =>
      data.objects.map((object) => ({
        id: object.objectId,
        label: objectTitle(object),
      })),
    [data.objects],
  );
  const selectedTimeObject = useMemo(
    () => data.objects.find((object) => object.objectId === timeObjectId),
    [data.objects, timeObjectId],
  );
  const fieldOptions = useMemo(
    () => numericFieldOptions(selectedTimeObject),
    [selectedTimeObject],
  );

  useEffect(() => {
    if (data.objects.length === 0) {
      setTimeObjectId("");
      return;
    }
    setTimeObjectId((current) =>
      current && data.objects.some((object) => object.objectId === current)
        ? current
        : data.objects[0]!.objectId,
    );
  }, [data.objects]);

  useEffect(() => {
    if (fieldOptions.length === 0) {
      setTimeFieldCode("");
      return;
    }
    setTimeFieldCode((current) =>
      current && fieldOptions.some((field) => field.id === current)
        ? current
        : fieldOptions[0]!.id,
    );
  }, [fieldOptions]);

  useEffect(() => {
    if (!selectedRunId || !timeObjectId || !timeFieldCode) {
      setSeriesPoints([]);
      setPlaying(false);
      return;
    }
    let disposed = false;
    setSeriesLoading(true);
    setPlaying(false);
    void viewClient
      .simSeries(workspaceId, selectedRunId, {
        object: timeObjectId,
        field: timeFieldCode,
        downsample: timeSeriesDownsample,
        page: 0,
        size: timeSeriesPageSize,
      })
      .then((page) => {
        if (disposed) return;
        setSeriesPoints(page.items);
        setCurrentTime(seriesDomain(page.items)?.min ?? 0);
      })
      .catch((error) => {
        if (disposed) return;
        reportError(
          error instanceof Error ? error.message : "读取时间序列失败",
        );
        setSeriesPoints([]);
      })
      .finally(() => {
        if (!disposed) setSeriesLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [
    reportError,
    selectedRunId,
    timeFieldCode,
    timeObjectId,
    viewClient,
    workspaceId,
  ]);

  useEffect(() => {
    const domain = seriesDomain(seriesPoints);
    if (!playing || !domain || domain.max <= domain.min) return undefined;
    const step = Math.max((domain.max - domain.min) / 90, 0.01);
    const timer = window.setInterval(() => {
      setCurrentTime((time) =>
        time + step > domain.max ? domain.min : time + step,
      );
    }, playbackTickMs);
    return () => window.clearInterval(timer);
  }, [playing, seriesPoints]);

  const layout = useMemo(
    () =>
      buildFloorplanRooms(
        data.objects,
        data.relations,
        selectedObjectId,
        activeDimension,
      ),
    [activeDimension, data.objects, data.relations, selectedObjectId],
  );
  const dimensions = floorplanDimensionOptions();
  const timeDomain = useMemo(() => seriesDomain(seriesPoints), [seriesPoints]);
  const seriesValueDomain = useMemo(
    () => valueDomain(seriesPoints),
    [seriesPoints],
  );
  const currentSeriesPoint = useMemo(
    () => nearestSeriesPoint(seriesPoints, currentTime),
    [currentTime, seriesPoints],
  );
  const currentHeatTone =
    seriesValueDomain && currentSeriesPoint
      ? floorplanHeatTone(
          currentSeriesPoint.value,
          seriesValueDomain.min,
          seriesValueDomain.max,
        )
      : null;
  const timeStatusText = seriesLoading
    ? "加载中"
    : seriesPoints.length === 0
      ? "暂无序列"
      : `t=${formatNumber(currentTime, 2)} · ${formatSeriesValue(
          currentSeriesPoint?.value,
        )} / ${formatNumber(timeDomain?.max ?? currentTime, 2)} · ${
          seriesPoints.length
        }/${timeSeriesPageSize} @${timeSeriesDownsample}x`;

  function openLineage(object: ViewObject, fieldCode: string): void {
    setLineageTarget({ object, fieldCode });
  }

  function openLineageFromKeyboard(
    event: ReactKeyboardEvent,
    object: ViewObject,
    fieldCode: string,
  ): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    openLineage(object, fieldCode);
  }

  function selectRoom(roomId: string): void {
    selection.select({ entityType: "object", entityId: roomId });
  }

  function selectRoomFromKeyboard(
    event: ReactKeyboardEvent,
    roomId: string,
  ): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectRoom(roomId);
  }

  return (
    <section className="floorplan-panel" aria-label="户型平面图">
      <div className="floorplan-toolbar">
        <div className="floorplan-dimension-switcher" aria-label="维度切换">
          {dimensions.map((dimension) => (
            <button
              aria-pressed={activeDimension === dimension.id}
              className={`floorplan-dimension-${dimension.id}`}
              key={dimension.id}
              onClick={() => setActiveDimension(dimension.id)}
              title={dimension.description}
              type="button"
            >
              {dimension.label}
            </button>
          ))}
        </div>
        <span>
          {layout.mode === "coordinate"
            ? "数据坐标 · 1m≈56px"
            : "示意平面 · 非真实坐标"}
        </span>
      </div>
      <TimePlayhead
        currentTime={currentTime}
        fieldOptions={fieldOptions}
        loading={simRunsLoading || seriesLoading}
        objectOptions={objectOptions}
        onFieldChange={setTimeFieldCode}
        onObjectChange={setTimeObjectId}
        onPlayingChange={setPlaying}
        onRunChange={setSelectedRunId}
        onTimeChange={setCurrentTime}
        playing={playing}
        points={seriesPoints}
        runs={simRuns}
        selectedFieldCode={timeFieldCode}
        selectedObjectId={timeObjectId}
        selectedRunId={selectedRunId}
        statusText={timeStatusText}
      />
      <div
        className="floorplan-stage"
        onClick={() => selection.clear()}
        role="presentation"
      >
        <div
          className="floorplan-canvas"
          style={{
            minHeight: `${layout.height}px`,
            width: `${layout.width}px`,
          }}
        >
          {layout.rooms.length === 0 ? (
            <div className="floorplan-empty">暂无房间对象</div>
          ) : (
            layout.rooms.map((room) => (
              <div
                aria-pressed={room.selected}
                className={[
                  "floorplan-room",
                  `floorplan-room-tone-${room.tone}`,
                  currentHeatTone && room.id === timeObjectId
                    ? `floorplan-room-time floorplan-heat-${currentHeatTone}`
                    : "",
                  room.selected ? "floorplan-room-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={room.id}
                onClick={(event) => {
                  event.stopPropagation();
                  selectRoom(room.id);
                }}
                onKeyDown={(event) => selectRoomFromKeyboard(event, room.id)}
                role="button"
                style={
                  {
                    "--floorplan-x": `${room.x}px`,
                    "--floorplan-y": `${room.y}px`,
                    "--floorplan-w": `${room.width}px`,
                    "--floorplan-h": `${room.height}px`,
                  } as FloorplanRoomStyle
                }
                tabIndex={0}
              >
                <span className="floorplan-rule">
                  <RuleLamp status={room.object.ruleStatus} />
                </span>
                <strong>{room.title}</strong>
                {room.areaChip ? (
                  <span
                    aria-label={`${room.areaChip.label} 血缘`}
                    className="fx-chip-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      openLineage(room.object, room.areaChip!.fieldCode);
                    }}
                    onKeyDown={(event) =>
                      openLineageFromKeyboard(
                        event,
                        room.object,
                        room.areaChip!.fieldCode,
                      )
                    }
                    role="button"
                    tabIndex={0}
                    title={`${room.areaChip.label} 血缘`}
                  >
                    <FxChip
                      label={room.areaChip.label}
                      readOnly={false}
                      unit={room.areaChip.unit}
                      value={room.areaChip.value}
                    />
                  </span>
                ) : null}
                {currentSeriesPoint && room.id === timeObjectId ? (
                  <span className="floorplan-time-chip">
                    {timeFieldCode}:{" "}
                    {formatSeriesValue(currentSeriesPoint.value)}
                  </span>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
      {lineageTarget ? (
        <LineageView
          fieldCode={lineageTarget.fieldCode}
          object={lineageTarget.object}
          onClose={() => setLineageTarget(null)}
          viewClient={viewClient}
          workspaceId={workspaceId}
        />
      ) : null}
    </section>
  );
}
