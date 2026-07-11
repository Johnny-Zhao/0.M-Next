import type { DocFieldRefGroupVm, DocViewModel } from "./doc-view-model";
import { UsButton, UsMonoTag, pushToast } from "../primitives";

export function DataPanel({
  vm,
  onLocate,
  onInsert,
}: {
  readonly vm: DocViewModel;
  readonly onLocate: (refId: string) => void;
  readonly onInsert: () => void;
}) {
  return (
    <aside className="us-datapanel">
      <header>
        <strong>数据面板 DATA</strong>
        <span>{vm.bindingType?.name ?? "数据源"}</span>
      </header>
      <section className="us-datapanel__record">
        <small>{vm.bindingType?.name ?? "产品规格库"} · 记录 001</small>
        <strong>{vm.bindingObject?.fields.name?.value ?? "智能门锁 S3"}</strong>
        <div>
          <UsButton
            onClick={() => vm.refs[0] && onLocate(vm.refs[0].refId)}
            size="sm"
            variant="secondary"
          >
            定位到显示处 · {vm.refCount}
          </UsButton>
          <UsButton
            onClick={() => pushToast({ title: "P2 提供切换记录" })}
            size="sm"
            variant="ghost"
          >
            切换记录
          </UsButton>
        </div>
      </section>
      <section className="us-datapanel__fields">
        <header>字段 · 在文档中的引用</header>
        {vm.fields.map((field) => (
          <FieldRefRow
            field={field}
            key={field.firstRefId}
            onLocate={onLocate}
          />
        ))}
      </section>
      <UsButton onClick={onInsert} size="sm" variant="primary">
        插入其他字段…
      </UsButton>
      <footer data-state={vm.howState}>
        {vm.howState === "ok" ? "✓ 同步状态:全部最新 · 刚刚" : vm.howLabel}
      </footer>
    </aside>
  );
}

function FieldRefRow({
  field,
  onLocate,
}: {
  readonly field: DocFieldRefGroupVm;
  readonly onLocate: (refId: string) => void;
}) {
  return (
    <button
      className="us-datapanel__field"
      onClick={() => onLocate(field.firstRefId)}
      type="button"
    >
      <span>
        <strong>{field.fieldName}</strong>
        <small className="us-data">{field.valueText}</small>
      </span>
      {field.state === "lowConfidence" ? (
        <UsMonoTag tone="change">{field.confidenceLabel ?? "74%"}</UsMonoTag>
      ) : field.state === "dangling" ? (
        <UsMonoTag tone="danger">悬空</UsMonoTag>
      ) : (
        <UsMonoTag>{field.count}</UsMonoTag>
      )}
    </button>
  );
}
