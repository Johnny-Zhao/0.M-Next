import { UsButton } from "../primitives";
import { formatSimTime } from "./sim-timing";

export function PlayBar({
  duration,
  loop,
  onLoopChange,
  onPlayingChange,
  onSpeedChange,
  onStop,
  playing,
  playhead,
  speed,
}: {
  readonly duration: number;
  readonly loop: boolean;
  readonly onLoopChange: (loop: boolean) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onSpeedChange: (speed: 1 | 2) => void;
  readonly onStop: () => void;
  readonly playing: boolean;
  readonly playhead: number;
  readonly speed: 1 | 2;
}) {
  const progress =
    duration > 0 ? Math.min(100, (playhead / duration) * 100) : 0;
  return (
    <div className="us-playbar" aria-label="simulation playback controls">
      <UsButton
        className="us-playbar__main"
        onClick={() => onPlayingChange(!playing)}
        size="sm"
        variant="emphasis"
      >
        {playing ? "暂停" : "播放"}
      </UsButton>
      <span className="us-playbar__time us-data">
        {formatSimTime(playhead)} / {formatSimTime(duration)}
      </span>
      <span className="us-playbar__track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
      <button
        aria-pressed={speed === 2}
        className="us-playbar__chip us-data"
        onClick={() => onSpeedChange(speed === 1 ? 2 : 1)}
        type="button"
      >
        {speed.toFixed(1)}x
      </button>
      <button
        aria-pressed={loop}
        className="us-playbar__chip"
        onClick={() => onLoopChange(!loop)}
        type="button"
      >
        循环
      </button>
      <span className="us-playbar__sep" />
      <UsButton onClick={onStop} size="sm" variant="ghost">
        停止
      </UsButton>
    </div>
  );
}
