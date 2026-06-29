import { type ReactElement } from "react";

import type { SimResultSeriesPoint, SimRunSummary } from "../api/view-client";

export interface TimeOption {
  readonly id: string;
  readonly label: string;
}

export interface TimeDomain {
  readonly min: number;
  readonly max: number;
}

export interface TimePlayheadProps {
  readonly runs: readonly SimRunSummary[];
  readonly objectOptions: readonly TimeOption[];
  readonly fieldOptions: readonly TimeOption[];
  readonly selectedRunId: string;
  readonly selectedObjectId: string;
  readonly selectedFieldCode: string;
  readonly currentTime: number;
  readonly points: readonly SimResultSeriesPoint[];
  readonly playing: boolean;
  readonly loading: boolean;
  readonly statusText: string;
  readonly onRunChange: (runId: string) => void;
  readonly onObjectChange: (objectId: string) => void;
  readonly onFieldChange: (fieldCode: string) => void;
  readonly onTimeChange: (time: number) => void;
  readonly onPlayingChange: (playing: boolean) => void;
}

export function seriesDomain(
  points: readonly Pick<SimResultSeriesPoint, "t">[],
): TimeDomain | null {
  const values = points.map((point) => point.t).filter(Number.isFinite);
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function nearestSeriesPoint(
  points: readonly SimResultSeriesPoint[],
  time: number,
): SimResultSeriesPoint | null {
  if (points.length === 0) return null;
  let best = points[0] ?? null;
  let bestDistance = best ? Math.abs(best.t - time) : Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.abs(point.t - time);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

export function TimePlayhead(props: TimePlayheadProps): ReactElement {
  const domain = seriesDomain(props.points);
  const disabled =
    props.runs.length === 0 ||
    props.objectOptions.length === 0 ||
    props.fieldOptions.length === 0 ||
    props.points.length === 0;
  const min = domain?.min ?? 0;
  const max = domain?.max ?? 1;
  const current = Number.isFinite(props.currentTime) ? props.currentTime : min;

  return (
    <div className="time-playhead" aria-label="时间轴">
      <label>
        <span>运行</span>
        <select
          disabled={props.loading || props.runs.length === 0}
          onChange={(event) => props.onRunChange(event.currentTarget.value)}
          value={props.selectedRunId}
        >
          {props.runs.length === 0 ? <option value="">暂无 run</option> : null}
          {props.runs.map((run) => (
            <option key={run.runId} value={run.runId}>
              {run.engineId} · {run.status}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>对象</span>
        <select
          disabled={props.loading || props.objectOptions.length === 0}
          onChange={(event) => props.onObjectChange(event.currentTarget.value)}
          value={props.selectedObjectId}
        >
          {props.objectOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>字段</span>
        <select
          disabled={props.loading || props.fieldOptions.length === 0}
          onChange={(event) => props.onFieldChange(event.currentTarget.value)}
          value={props.selectedFieldCode}
        >
          {props.fieldOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        aria-pressed={props.playing}
        disabled={disabled || props.loading}
        onClick={() => props.onPlayingChange(!props.playing)}
        type="button"
      >
        {props.playing ? "暂停" : "播放"}
      </button>
      <input
        aria-label="当前时间"
        disabled={disabled || props.loading}
        max={max}
        min={min}
        onChange={(event) =>
          props.onTimeChange(Number(event.currentTarget.value))
        }
        step="any"
        type="range"
        value={Math.min(max, Math.max(min, current))}
      />
      <output>{props.loading ? "加载中" : props.statusText}</output>
    </div>
  );
}
