import { useMemo, useState, type ChangeEvent, type ReactElement } from "react";

import type {
  ExchangeDiffResult,
  ExchangeExportResult,
  ExchangeFormat,
} from "@m-next/views";

import { fieldLabel } from "../display-labels";
import { useToast } from "../toast";
import { useWorkbenchContext } from "./workbench";

const formats: readonly ExchangeFormat[] = ["json", "reqif"];

export function exchangeSummaryItems(
  diff: ExchangeDiffResult | null,
): readonly {
  readonly label: string;
  readonly value: number;
  readonly tone: string;
}[] {
  if (!diff) return [];
  return [
    { label: "对象新增", value: diff.summary.objectsAdded, tone: "add" },
    { label: "对象变更", value: diff.summary.objectsChanged, tone: "change" },
    { label: "对象删除", value: diff.summary.objectsRemoved, tone: "remove" },
    { label: "关系新增", value: diff.summary.relationsAdded, tone: "add" },
    { label: "关系变更", value: diff.summary.relationsChanged, tone: "change" },
    { label: "关系删除", value: diff.summary.relationsRemoved, tone: "remove" },
  ];
}

export function exchangeFilename(
  workspaceId: string,
  format: ExchangeFormat,
): string {
  return `mnext-${workspaceId}.${format === "reqif" ? "reqif" : "json"}`;
}

export function downloadExchangeArtifact(
  workspaceId: string,
  artifact: ExchangeExportResult,
): void {
  const blob = new Blob([artifact.payload], { type: artifact.contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exchangeFilename(workspaceId, artifact.format);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExchangePanel(): ReactElement {
  const {
    commandClient,
    objectType,
    refreshViews,
    reportError,
    viewClient,
    workspaceId,
  } = useWorkbenchContext();
  const toast = useToast();
  const [format, setFormat] = useState<ExchangeFormat>("json");
  const [payload, setPayload] = useState("");
  const [diff, setDiff] = useState<ExchangeDiffResult | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => exchangeSummaryItems(diff), [diff]);
  const hasPayload = payload.trim().length > 0;

  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setPayload(await file.text());
    setDiff(null);
    setResult(`已读取 ${file.name}`);
  }

  async function preview(): Promise<void> {
    if (!hasPayload) {
      toast.info("请选择文件或粘贴内容");
      return;
    }
    setBusy(true);
    setResult("");
    try {
      const next = await viewClient.exchangePreview(
        workspaceId,
        format,
        payload,
      );
      setDiff(next);
      toast.success("导入预览已生成");
    } catch (error) {
      setDiff(null);
      reportError(error instanceof Error ? error.message : "交换预览失败");
    } finally {
      setBusy(false);
    }
  }

  async function apply(): Promise<void> {
    if (!diff) {
      toast.info("请先预览导入内容");
      return;
    }
    setBusy(true);
    setResult("");
    try {
      const applied = await commandClient.exchangeApply(
        workspaceId,
        format,
        payload,
      );
      refreshViews();
      setResult(
        `已应用 ${applied.applied.length} 项,未应用 ${applied.unapplied.length} 项`,
      );
      toast.success("导入已提交并刷新视图");
    } catch (error) {
      reportError(error instanceof Error ? error.message : "交换导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function exportArtifact(): Promise<void> {
    setBusy(true);
    setResult("");
    try {
      const artifact = await viewClient.exchangeExport(
        workspaceId,
        format,
        objectType || null,
      );
      downloadExchangeArtifact(workspaceId, artifact);
      setResult(`已导出 ${exchangeFilename(workspaceId, format)}`);
      toast.success("交换制品已导出");
    } catch (error) {
      reportError(error instanceof Error ? error.message : "交换导出失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside aria-label="交换导入" className="exchange-panel">
      <section className="exchange-card">
        <header>
          <div>
            <strong>交换导入</strong>
            <span>JSON / ReqIF</span>
          </div>
          <button
            disabled={busy}
            onClick={() => void exportArtifact()}
            type="button"
          >
            导出当前范围
          </button>
        </header>
        <div className="exchange-controls">
          <label>
            格式
            <select
              onChange={(event) =>
                setFormat(event.currentTarget.value as ExchangeFormat)
              }
              value={format}
            >
              {formats.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            文件
            <input
              accept={
                format === "reqif" ? ".reqif,.xml" : ".json,application/json"
              }
              onChange={(event) => void readFile(event)}
              type="file"
            />
          </label>
        </div>
        <label className="exchange-payload">
          内容
          <textarea
            onChange={(event) => {
              setPayload(event.currentTarget.value);
              setDiff(null);
            }}
            spellCheck={false}
            value={payload}
          />
        </label>
        <footer>
          <button
            disabled={busy || !hasPayload}
            onClick={() => void preview()}
            type="button"
          >
            预览变更
          </button>
          <button
            disabled={busy || !diff}
            onClick={() => void apply()}
            type="button"
          >
            应用导入
          </button>
          {result ? <span>{result}</span> : null}
        </footer>
      </section>
      <ExchangeDiffSummary diff={diff} summary={summary} />
    </aside>
  );
}

function ExchangeDiffSummary({
  diff,
  summary,
}: {
  readonly diff: ExchangeDiffResult | null;
  readonly summary: readonly {
    readonly label: string;
    readonly value: number;
    readonly tone: string;
  }[];
}): ReactElement {
  if (!diff) return <p className="view-empty-state">暂无导入预览。</p>;
  return (
    <section className="exchange-diff">
      <div className="exchange-summary-grid">
        {summary.map((item) => (
          <span
            className={`exchange-summary exchange-${item.tone}`}
            key={item.label}
          >
            <b>{item.value}</b>
            {item.label}
          </span>
        ))}
      </div>
      <div className="exchange-diff-columns">
        <DiffList title="新增对象" values={diff.objects.added} />
        <DiffList title="删除对象" values={diff.objects.removed} />
        <ChangedObjects values={diff.objects.changed} />
        <DiffList title="新增关系" values={diff.relations.added} />
        <DiffList title="删除关系" values={diff.relations.removed} />
        <ChangedRelations values={diff.relations.changed} />
      </div>
    </section>
  );
}

function DiffList({
  title,
  values,
}: {
  readonly title: string;
  readonly values: readonly string[];
}): ReactElement | null {
  if (values.length === 0) return null;
  return (
    <section>
      <h3>{title}</h3>
      {values.map((value, index) => (
        <span key={value}>项目 {index + 1}</span>
      ))}
    </section>
  );
}

function ChangedObjects({
  values,
}: {
  readonly values: readonly ExchangeDiffResult["objects"]["changed"][number][];
}): ReactElement | null {
  if (values.length === 0) return null;
  return (
    <section>
      <h3>变更对象</h3>
      {values.map((value, index) => (
        <article key={value.objectId}>
          <strong>对象 {index + 1}</strong>
          <FieldChanges fields={value.fields} />
        </article>
      ))}
    </section>
  );
}

function ChangedRelations({
  values,
}: {
  readonly values: readonly ExchangeDiffResult["relations"]["changed"][number][];
}): ReactElement | null {
  if (values.length === 0) return null;
  return (
    <section>
      <h3>变更关系</h3>
      {values.map((value, index) => (
        <article key={value.relationId}>
          <strong>关系 {index + 1}</strong>
          <FieldChanges fields={value.fields} />
        </article>
      ))}
    </section>
  );
}

function FieldChanges({
  fields,
}: {
  readonly fields: ExchangeDiffResult["objects"]["changed"][number]["fields"];
}): ReactElement {
  const changed = Object.entries(fields.changed);
  const added = Object.keys(fields.added);
  const removed = Object.keys(fields.removed);
  return (
    <ul>
      {changed.map(([code, change]) => (
        <li key={code}>
          {fieldLabel(code)}: {valueText(change.from)} → {valueText(change.to)}
        </li>
      ))}
      {added.map((code) => (
        <li key={code}>{fieldLabel(code)}: 新增</li>
      ))}
      {removed.map((code) => (
        <li key={code}>{fieldLabel(code)}: 删除</li>
      ))}
    </ul>
  );
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "空";
  if (typeof value === "object") return "对象值";
  const text = String(value);
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
      text,
    ) ||
    /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/i.test(text)
  ) {
    return "内部值";
  }
  return text;
}
