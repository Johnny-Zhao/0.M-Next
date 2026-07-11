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
    <button
      className="us-ltoggle"
      data-on={split}
      onClick={() => onToggle(!split)}
      type="button"
    >
      <span>分屏对照</span>
      <i aria-pressed={split} role="switch" />
    </button>
  );
}
