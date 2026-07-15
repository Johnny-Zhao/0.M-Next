import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { UsButton, UsInput } from "../primitives";
import { useKernelRuntimeState } from "../data/boot-mode";
import { useSelectionSnapshot } from "../state/selection-store";
import { sessionStore, useSessionSnapshot } from "../state/session-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { DataGrid } from "./data-grid";
import { KernelValidationPanel } from "../validation/kernel-validation-panel";
import {
  buildExpressionGridViewModel,
  type ExpressionGridSort,
} from "./expression-grid-view-model";

export function ExpressionGridView({ viewId }: { readonly viewId: string }) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const selection = useSelectionSnapshot();
  const kernelRuntime = useKernelRuntimeState();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<ExpressionGridSort>();
  const [page, setPage] = useState(0);
  const view = workspace.views.find((candidate) => candidate.id === viewId);
  const vm = useMemo(
    () =>
      view
        ? buildExpressionGridViewModel({
            workspace,
            view,
            search,
            filters,
            sort,
            page,
          })
        : null,
    [filters, page, search, sort, view, workspace],
  );

  useEffect(() => {
    setSearch("");
    setFilters({});
    setSort(undefined);
    setPage(0);
  }, [viewId]);

  if (!view || !vm) {
    return <GridUnavailable message="当前表格视图不存在。" />;
  }
  if (vm.state === "unavailable" || !vm.objectType) {
    return <GridUnavailable message={vm.message ?? "当前表格视图不可用。"} />;
  }
  const maskValues = !sessionStore.can(
    session.currentMemberId,
    vm.objectType.code,
    "read",
  );
  const selectedCount = selection.selected.filter(
    (item) => item.entityType === "object",
  ).length;
  const changeFilter = (fieldCode: string, value: string) => {
    setFilters((current) => ({ ...current, [fieldCode]: value }));
    setPage(0);
  };
  const changeSortField = (fieldCode: string) => {
    setSort(
      fieldCode
        ? { fieldCode, direction: vm.sort?.direction ?? "asc" }
        : undefined,
    );
    setPage(0);
  };

  return (
    <ExpressionGridFrame
      validationPanel={
        kernelRuntime.backend && vm.validation ? (
          <KernelValidationPanel config={vm.validation} />
        ) : null
      }
    >
      <header className="us-expression-grid__heading">
        <div>
          <h2>{vm.title}</h2>
          {vm.description ? <p>{vm.description}</p> : null}
        </div>
        <span>{vm.objectType.name}</span>
      </header>
      <div className="us-grid-toolbar us-expression-grid__toolbar">
        <UsInput
          aria-label="搜索当前表格"
          containerClassName="us-grid-toolbar__search"
          kind="search"
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(0);
          }}
          placeholder="搜索当前列…"
          value={search}
        />
        {vm.filters.map((filter) => (
          <label key={filter.field.code}>
            <span>{filter.field.name}</span>
            {filter.field.dataType === "enum" ? (
              <select
                aria-label={`筛选 ${filter.field.name}`}
                onChange={(event) =>
                  changeFilter(filter.field.code, event.currentTarget.value)
                }
                value={filter.value}
              >
                <option value="">全部</option>
                {filter.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={`筛选 ${filter.field.name}`}
                onChange={(event) =>
                  changeFilter(filter.field.code, event.currentTarget.value)
                }
                type="search"
                value={filter.value}
              />
            )}
          </label>
        ))}
        <label>
          <span>排序</span>
          <select
            aria-label="排序字段"
            onChange={(event) => changeSortField(event.currentTarget.value)}
            value={vm.sort?.fieldCode ?? ""}
          >
            <option value="">默认顺序</option>
            {vm.objectType.fields.map((field) => (
              <option key={field.code} value={field.code}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
        {vm.sort ? (
          <UsButton
            onClick={() => {
              setSort({
                ...vm.sort!,
                direction: vm.sort!.direction === "asc" ? "desc" : "asc",
              });
              setPage(0);
            }}
            size="sm"
            variant="secondary"
          >
            {vm.sort.direction === "asc" ? "升序" : "降序"}
          </UsButton>
        ) : null}
      </div>
      {maskValues ? (
        <div className="us-grid-masknotice">字段值按数据源权限脱敏显示。</div>
      ) : null}
      {vm.state === "empty" ? (
        <div className="us-expression-grid__empty" role="status">
          {vm.message}
        </div>
      ) : (
        <DataGrid
          maskValues={maskValues}
          objectType={vm.objectType}
          objects={vm.objects}
          showCreatePlaceholder={false}
        />
      )}
      <footer className="us-grid-status us-expression-grid__status">
        <span>{vm.total} 条记录</span>
        <span>
          {vm.rangeStart}–{vm.rangeEnd}
        </span>
        <span>已选 {selectedCount}</span>
        <div>
          <UsButton
            disabled={vm.page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            size="sm"
            variant="secondary"
          >
            上一页
          </UsButton>
          <span>
            {vm.page + 1} / {vm.pageCount}
          </span>
          <UsButton
            disabled={vm.page + 1 >= vm.pageCount}
            onClick={() => setPage((current) => current + 1)}
            size="sm"
            variant="secondary"
          >
            下一页
          </UsButton>
        </div>
      </footer>
    </ExpressionGridFrame>
  );
}

export function ExpressionGridFrame({
  children,
  validationPanel,
}: {
  readonly children: ReactNode;
  readonly validationPanel: ReactNode;
}) {
  return (
    <section className="us-grid-shell us-expression-grid">
      <div className="us-expression-grid__scroll">{children}</div>
      {validationPanel}
    </section>
  );
}

function GridUnavailable({ message }: { readonly message: string }) {
  return (
    <section className="us-canvas-empty" role="status">
      <h2>当前表格表达不可用</h2>
      <p>{message}</p>
    </section>
  );
}
