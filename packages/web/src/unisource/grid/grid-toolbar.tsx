import { IconSearch, UsButton, UsInput, pushToast } from "../primitives";

export function GridToolbar({
  search,
  recordSetLabel = "记录集",
  searchPlaceholder = "搜索记录…",
  hideEol,
  onSearch,
  onToggleHideEol,
}: {
  readonly search: string;
  readonly recordSetLabel?: string;
  readonly searchPlaceholder?: string;
  readonly hideEol: boolean;
  readonly onSearch: (value: string) => void;
  readonly onToggleHideEol: () => void;
}) {
  return (
    <div className="us-grid-toolbar">
      <span className="us-grid-toolbar__recordset">
        记录集 · {recordSetLabel}
      </span>
      <UsInput
        aria-label="搜索记录"
        containerClassName="us-grid-toolbar__search"
        kind="search"
        onChange={(event) => onSearch(event.currentTarget.value)}
        placeholder={searchPlaceholder}
        value={search}
      />
      <UsButton
        aria-pressed={hideEol}
        onClick={onToggleHideEol}
        size="sm"
        variant={hideEol ? "primary" : "secondary"}
      >
        状态 ≠ 停产
      </UsButton>
      <UsButton
        icon={<IconSearch size={13} />}
        onClick={() => pushToast({ title: "P2 提供新建记录" })}
        size="sm"
        variant="emphasis"
      >
        新建记录
      </UsButton>
    </div>
  );
}
