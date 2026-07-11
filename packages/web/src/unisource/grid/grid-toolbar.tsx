import { IconSearch, UsButton, UsInput, pushToast } from "../primitives";

export function GridToolbar({
  search,
  hideEol,
  onSearch,
  onToggleHideEol,
}: {
  readonly search: string;
  readonly hideEol: boolean;
  readonly onSearch: (value: string) => void;
  readonly onToggleHideEol: () => void;
}) {
  return (
    <div className="us-grid-toolbar">
      <span className="us-grid-toolbar__recordset">记录集 · 产品规格</span>
      <UsInput
        aria-label="搜索记录"
        containerClassName="us-grid-toolbar__search"
        kind="search"
        onChange={(event) => onSearch(event.currentTarget.value)}
        placeholder="搜索产品名…"
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
