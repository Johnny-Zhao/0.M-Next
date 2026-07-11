import { UsMonoTag } from "../primitives";
import type { SimNetwork, SimTimeline } from "./sim-timing";
import { formatSimTime } from "./sim-timing";

export function SimParamsPanel({
  network,
  onNetworkChange,
  playhead,
  scenarioName,
  timeline,
}: {
  readonly network: SimNetwork;
  readonly onNetworkChange: (network: SimNetwork) => void;
  readonly playhead: number;
  readonly scenarioName: string;
  readonly timeline: SimTimeline;
}) {
  const currentEventId =
    playhead >= timeline.duration
      ? "sim-end"
      : timeline.events.filter((event) => playhead >= event.at).at(-1)?.id;
  return (
    <aside className="us-sim-panel">
      <header className="us-sim-panel__head">
        <UsMonoTag active>SIMULATE</UsMonoTag>
        <strong>仿真参数</strong>
      </header>
      <section className="us-sim-panel__section">
        <span className="us-sim-panel__label">场景</span>
        <button className="us-sim-select" disabled type="button">
          {scenarioName}
        </button>
      </section>
      <section className="us-sim-panel__section">
        <span className="us-sim-panel__label">网络</span>
        <div className="us-sim-segment" role="group" aria-label="network">
          <button
            aria-pressed={network === "normal"}
            onClick={() => onNetworkChange("normal")}
            type="button"
          >
            正常
          </button>
          <button
            aria-pressed={network === "weak"}
            onClick={() => onNetworkChange("weak")}
            type="button"
          >
            弱网
          </button>
        </div>
      </section>
      <section className="us-sim-panel__section us-sim-timeline">
        <span className="us-sim-panel__label">事件时间线 · TIMELINE</span>
        <ol>
          {timeline.events.map((event) => (
            <li data-current={event.id === currentEventId} key={event.id}>
              <span className="us-data">{formatSimTime(event.at)}</span>
              <strong>{event.label}</strong>
            </li>
          ))}
          <li data-current={currentEventId === "sim-end"}>
            <span className="us-data">{formatSimTime(timeline.duration)}</span>
            <strong>回放结束 · 循环</strong>
          </li>
        </ol>
      </section>
      <section className="us-sim-panel__section">
        <span className="us-sim-panel__label">指标 · METRICS</span>
        <div className="us-sim-metrics">
          <MetricTile
            label="端到端延迟"
            value={`${timeline.endToEnd.toFixed(1)}s`}
          />
          <MetricTile label="日耗电(估)" value="+0.8%" />
          <MetricTile label="事件数" value={String(timeline.events.length)} />
          <MetricTile label="弱网重试" value={String(timeline.retries)} />
        </div>
      </section>
      <p className="us-sim-panel__note">
        仿真结果可存为快照,随规格书一起发给客户。
      </p>
    </aside>
  );
}

function MetricTile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="us-sim-metric">
      <span>{label}</span>
      <strong className="us-data">{value}</strong>
    </div>
  );
}
