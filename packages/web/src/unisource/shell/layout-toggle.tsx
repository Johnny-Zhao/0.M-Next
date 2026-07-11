import { UsButton } from "../primitives";

export function nextLayoutSearch(search: string, split: boolean): string {
  const params = new URLSearchParams(search);
  if (split) {
    params.set("layout", "split");
  } else {
    params.delete("layout");
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function LayoutToggle({
  split,
  onToggle,
}: {
  readonly split: boolean;
  readonly onToggle: (split: boolean) => void;
}) {
  return (
    <span className="us-ltoggle" aria-label="布局">
      <UsButton
        aria-pressed={!split}
        onClick={() => onToggle(false)}
        size="sm"
        variant={!split ? "primary" : "secondary"}
      >
        单页
      </UsButton>
      <UsButton
        aria-pressed={split}
        onClick={() => onToggle(true)}
        size="sm"
        variant={split ? "primary" : "secondary"}
      >
        分屏
      </UsButton>
    </span>
  );
}
