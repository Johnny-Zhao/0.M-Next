import { useEffect, useMemo, useState, type ReactElement } from "react";

import type {
  MappingCorrespondence,
  MappingCoverageItem,
  MappingCoveragePage,
  ViewClient,
} from "../api/view-client";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import type { SelectionRef } from "../selection/selection-ref";

export interface MappingViewProps {
  readonly workspaceId: string;
  readonly viewClient: Pick<
    ViewClient,
    "mappingCorrespondences" | "mappingCoverage"
  >;
  readonly selection: SelectionCoordinator;
  readonly refreshKey?: number;
  readonly onError: (message: string) => void;
}

const coveragePageSize = 30;

export function MappingView({
  workspaceId,
  viewClient,
  selection,
  refreshKey = 0,
  onError,
}: MappingViewProps): ReactElement {
  const [correspondences, setCorrespondences] = useState<
    readonly MappingCorrespondence[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<MappingCoveragePage | null>(null);
  const [selected, setSelected] = useState<SelectionRef | null>(
    selection.current(),
  );
  const [loadingGraph, setLoadingGraph] = useState(true);
  const [loadingCoverage, setLoadingCoverage] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => selection.subscribe(setSelected), [selection]);

  useEffect(() => {
    let disposed = false;
    async function load(): Promise<void> {
      setLoadingGraph(true);
      try {
        const loaded = await viewClient.mappingCorrespondences(workspaceId);
        if (disposed) return;
        setCorrespondences(loaded);
        setSelectedId(
          (current) => current ?? loaded[0]?.correspondenceId ?? null,
        );
      } catch (error) {
        if (!disposed) {
          setCorrespondences([]);
          setSelectedId(null);
          onError(error instanceof Error ? error.message : "映射骨架加载失败");
        }
      } finally {
        if (!disposed) setLoadingGraph(false);
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [onError, refreshKey, viewClient, workspaceId]);

  const selectedMapping = useMemo(
    () => correspondences.find((item) => item.correspondenceId === selectedId),
    [correspondences, selectedId],
  );

  useEffect(() => {
    const mapping = selectedMapping;
    if (!mapping) {
      setCoverage(null);
      return;
    }
    const correspondenceId = mapping.correspondenceId;
    let disposed = false;
    async function load(): Promise<void> {
      setLoadingCoverage(true);
      try {
        const loaded = await viewClient.mappingCoverage(
          workspaceId,
          correspondenceId,
          page,
          coveragePageSize,
        );
        if (!disposed) setCoverage(loaded);
      } catch (error) {
        if (!disposed) {
          setCoverage(null);
          onError(error instanceof Error ? error.message : "映射覆盖加载失败");
        }
      } finally {
        if (!disposed) setLoadingCoverage(false);
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [onError, page, selectedMapping, viewClient, workspaceId]);

  function pickMapping(mapping: MappingCorrespondence): void {
    setSelectedId(mapping.correspondenceId);
    setPage(0);
    selectMappingCorrespondence(selection, mapping);
  }

  return (
    <section className="mapping-view" aria-label="映射视图">
      <header className="mapping-view-header">
        <div>
          <strong>映射</strong>
          <span>profile stereotype 对应与实例覆盖</span>
        </div>
        <small>{correspondences.length} 条对应</small>
      </header>
      {loadingGraph ? <MappingSkeleton /> : null}
      {!loadingGraph && correspondences.length === 0 ? (
        <p className="view-empty-state">当前工作空间没有可展示的映射对应。</p>
      ) : null}
      {correspondences.length > 0 ? (
        <div className="mapping-layout">
          <div className="mapping-graph" aria-label="stereotype 对应骨架">
            {correspondences.map((mapping) => (
              <MappingRow
                key={mapping.correspondenceId}
                mapping={mapping}
                selected={mapping.correspondenceId === selectedId}
                selection={selected}
                onPick={() => pickMapping(mapping)}
              />
            ))}
          </div>
          <CoveragePanel
            coverage={coverage}
            loading={loadingCoverage}
            mapping={selectedMapping}
            page={page}
            selection={selection}
            onPage={setPage}
          />
        </div>
      ) : null}
    </section>
  );
}

function MappingSkeleton(): ReactElement {
  return (
    <div className="mapping-skeleton" aria-label="映射加载中">
      <span />
      <span />
      <span />
    </div>
  );
}

function MappingRow({
  mapping,
  selected,
  selection,
  onPick,
}: {
  readonly mapping: MappingCorrespondence;
  readonly selected: boolean;
  readonly selection: SelectionRef | null;
  readonly onPick: () => void;
}): ReactElement {
  const externallySelected =
    selection?.entityType === "relation" &&
    selection.entityId === relationSelectionId(mapping);
  return (
    <button
      aria-pressed={selected || externallySelected}
      className="mapping-row"
      onClick={onPick}
      type="button"
    >
      <StereotypeCard
        profile={mapping.sourceProfile}
        code={mapping.sourceTypeCode}
        name={mapping.sourceTypeName}
      />
      <span className="mapping-connector">
        <span>{directionLabel(mapping.direction)}</span>
        <strong>{mapping.relationType}</strong>
        <small>{mapping.cardinality}</small>
      </span>
      <StereotypeCard
        profile={mapping.targetProfile}
        code={mapping.targetTypeCode}
        name={mapping.targetTypeName}
      />
    </button>
  );
}

function StereotypeCard({
  profile,
  code,
  name,
}: {
  readonly profile: string;
  readonly code: string;
  readonly name: string;
}): ReactElement {
  return (
    <span className="mapping-type-card">
      <small>{profile}</small>
      <strong>{name || code}</strong>
      <code>{code}</code>
    </span>
  );
}

function CoveragePanel({
  mapping,
  coverage,
  loading,
  page,
  selection,
  onPage,
}: {
  readonly mapping: MappingCorrespondence | undefined;
  readonly coverage: MappingCoveragePage | null;
  readonly loading: boolean;
  readonly page: number;
  readonly selection: SelectionCoordinator;
  readonly onPage: (page: number) => void;
}): ReactElement {
  const total = coverage?.total ?? 0;
  const hasNext = coverage
    ? (coverage.page + 1) * coverage.pageSize < total
    : false;
  return (
    <aside className="mapping-coverage" aria-label="实例覆盖">
      <header>
        <strong>
          {mapping
            ? `${mapping.sourceTypeCode} -> ${mapping.targetTypeCode}`
            : "实例覆盖"}
        </strong>
        <span>{total} 项</span>
      </header>
      {mapping ? <FieldMappingList mapping={mapping} /> : null}
      {loading ? <p className="mapping-muted">覆盖加载中...</p> : null}
      {!loading && coverage?.items.length === 0 ? (
        <p className="mapping-muted">这条对应暂无实例覆盖结果。</p>
      ) : null}
      <div className="mapping-coverage-list">
        {coverage?.items.map((item) => (
          <CoverageRow
            item={item}
            key={`${item.sourceObjectId}-${item.targetObjectId ?? "missing"}`}
            selection={selection}
          />
        ))}
      </div>
      <footer className="mapping-pagination">
        <button
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          type="button"
        >
          上一页
        </button>
        <span>{page + 1}</span>
        <button
          disabled={!hasNext}
          onClick={() => onPage(page + 1)}
          type="button"
        >
          下一页
        </button>
      </footer>
    </aside>
  );
}

function FieldMappingList({
  mapping,
}: {
  readonly mapping: MappingCorrespondence;
}): ReactElement {
  if (mapping.fieldMappings.length === 0) {
    return <p className="mapping-muted">未配置字段映射。</p>;
  }
  return (
    <ul className="mapping-fields" aria-label="字段映射">
      {mapping.fieldMappings.slice(0, 6).map((field) => (
        <li key={`${field.expression}-${field.targetFieldCode}`}>
          <code>{field.expression}</code>
          <span>{"->"}</span>
          <code>{field.targetFieldCode}</code>
        </li>
      ))}
    </ul>
  );
}

function CoverageRow({
  item,
  selection,
}: {
  readonly item: MappingCoverageItem;
  readonly selection: SelectionCoordinator;
}): ReactElement {
  return (
    <article
      className={`mapping-coverage-row ${coverageStatusTone(item.status)}`}
    >
      <button
        onClick={() => selectCoverageObject(selection, item, "source")}
        type="button"
      >
        <strong>{item.sourceLabel}</strong>
        <small>
          v{item.sourceVersion} / 锚 {anchoredSourceVersionLabel(item)}
        </small>
      </button>
      <span className="mapping-status-chip">
        {coverageStatusLabel(item.status)}
      </span>
      <button
        disabled={!item.targetObjectId}
        onClick={() => selectCoverageObject(selection, item, "target")}
        type="button"
      >
        <strong>{item.targetLabel ?? "未映射"}</strong>
        <small>{item.targetVersion ? `v${item.targetVersion}` : "-"}</small>
      </button>
    </article>
  );
}

export function coverageStatusLabel(
  status: MappingCoverageItem["status"],
): string {
  if (status === "mapped") return "已映射";
  if (status === "stale") return "已过期";
  return "未映射";
}

export function coverageStatusTone(
  status: MappingCoverageItem["status"],
): string {
  if (status === "mapped") return "mapping-coverage-mapped";
  if (status === "stale") return "mapping-coverage-stale";
  return "mapping-coverage-unmapped";
}

export function anchoredSourceVersionLabel(item: MappingCoverageItem): string {
  return item.anchoredSourceVersion == null
    ? "—"
    : `v${item.anchoredSourceVersion}`;
}

export function selectMappingCorrespondence(
  selection: SelectionCoordinator,
  mapping: MappingCorrespondence,
): void {
  selection.select({
    entityType: "relation",
    entityId: relationSelectionId(mapping),
  });
}

export function selectCoverageObject(
  selection: SelectionCoordinator,
  item: MappingCoverageItem,
  side: "source" | "target",
): void {
  const entityId =
    side === "source" ? item.sourceObjectId : item.targetObjectId;
  if (!entityId) return;
  selection.select({ entityType: "object", entityId });
}

function relationSelectionId(mapping: MappingCorrespondence): string {
  return mapping.relationTypeId ?? mapping.correspondenceId;
}

function directionLabel(
  mappingDirection: MappingCorrespondence["direction"],
): string {
  if (mappingDirection === "target_to_source") return "<-";
  if (mappingDirection === "bidirectional") return "<->";
  return "->";
}
