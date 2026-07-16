import { UsButton, UsInput } from "../primitives";

export function GridToolbar({
  search,
  recordSetLabel = "记录集",
  searchPlaceholder = "搜索记录…",
  hideEol,
  onCreate,
  createDisabled = false,
  createDisabledReason,
  onEdit,
  editDisabled = true,
  editDisabledReason = "请选择一条记录",
  onSearch,
  onToggleHideEol,
}: {
  readonly search: string;
  readonly recordSetLabel?: string;
  readonly searchPlaceholder?: string;
  readonly hideEol: boolean;
  readonly onCreate?: () => void;
  readonly createDisabled?: boolean;
  readonly createDisabledReason?: string;
  readonly onEdit?: () => void;
  readonly editDisabled?: boolean;
  readonly editDisabledReason?: string;
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
      {onEdit ? (
        <UsButton
          disabled={editDisabled}
          onClick={onEdit}
          size="sm"
          title={editDisabled ? editDisabledReason : "编辑所选记录"}
          variant="secondary"
        >
          编辑
        </UsButton>
      ) : null}
      {onCreate ? (
        <UsButton
          disabled={createDisabled}
          onClick={onCreate}
          size="sm"
          variant="emphasis"
          title={createDisabled ? createDisabledReason : "新建记录"}
        >
          新建记录
        </UsButton>
      ) : null}
    </div>
  );
}
