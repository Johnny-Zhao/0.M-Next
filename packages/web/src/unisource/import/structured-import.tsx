import { useState } from "react";

import { useKernelRuntimeState } from "../data/boot-mode";
import type {
  ExchangeApplyOutcome,
  ExchangeChangedObject,
  ExchangeChangedRelation,
  ExchangeDiff,
  ExchangeFormat,
} from "../data/gateway";
import { UsButton, UsMonoTag, pushToast } from "../primitives";
import { useSessionSnapshot } from "../state/session-store";
import {
  structuredImportStore,
  useStructuredImportSnapshot,
} from "../state/structured-import-store";

const JSON_SAMPLE = `{
  "objects": [
    {
      "id": "prod-new",
      "objectType": "product_specs",
      "fields": { "name": "New product", "price": 1299 }
    }
  ],
  "relations": []
}`;

export function StructuredImport() {
  const kernelRuntime = useKernelRuntimeState();
  const session = useSessionSnapshot();
  const state = useStructuredImportSnapshot();
  const [format, setFormat] = useState<ExchangeFormat>("json");
  const [payload, setPayload] = useState(JSON_SAMPLE);
  const canUseKernel = kernelRuntime.backend;
  const disabled = state.busy || !payload.trim() || !canUseKernel;

  const loadFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then(
      (text) => setPayload(text),
      (error: unknown) =>
        pushToast({
          title: "读取导入文件失败",
          desc: error instanceof Error ? error.message : String(error),
        }),
    );
  };

  return (
    <section className="us-structured-import">
      <article className="us-import-card us-structured-import__input">
        <header>
          <div>
            <UsMonoTag active={canUseKernel}>KERNEL EXCHANGE</UsMonoTag>
            <strong>结构化导入</strong>
          </div>
          <span>JSON / ReqIF · 预览后确认写入</span>
        </header>
        <div className="us-structured-import__controls">
          <label>
            <span>格式</span>
            <select
              disabled={state.busy}
              onChange={(event) =>
                setFormat(event.currentTarget.value as ExchangeFormat)
              }
              value={format}
            >
              <option value="json">JSON</option>
              <option value="reqif">ReqIF</option>
            </select>
          </label>
          <label>
            <span>上传文本制品</span>
            <input
              accept={
                format === "json"
                  ? ".json,application/json"
                  : ".reqif,.xml,text/xml,application/xml"
              }
              disabled={state.busy}
              onChange={(event) => loadFile(event.currentTarget.files?.[0])}
              type="file"
            />
          </label>
        </div>
        <label className="us-structured-import__payload">
          <span>制品内容</span>
          <textarea
            disabled={state.busy}
            onChange={(event) => setPayload(event.currentTarget.value)}
            spellCheck={false}
            value={payload}
          />
        </label>
        {!canUseKernel ? (
          <p className="us-structured-import__note">
            结构化导入需连接内核；Mock 模式保留脚本 AI 导入演示。
          </p>
        ) : null}
        <footer className="us-import-actions">
          <UsButton
            disabled={disabled}
            onClick={() =>
              void structuredImportStore.preview(
                format,
                payload,
                session.currentMemberId,
              )
            }
            size="sm"
            variant="secondary"
          >
            {state.busy ? "处理中..." : "预览"}
          </UsButton>
          <UsButton
            disabled={disabled || !state.preview}
            onClick={() =>
              void structuredImportStore.apply(
                format,
                payload,
                session.currentMemberId,
              )
            }
            size="sm"
            variant="primary"
          >
            确认导入
          </UsButton>
        </footer>
      </article>

      <article className="us-import-card us-structured-import__result">
        <header>
          <strong>交换预览</strong>
          <span>
            {state.applyResult
              ? `已应用 ${state.applyResult.applied.length} · 未应用 ${state.applyResult.unapplied.length}`
              : "dry-run 不写入"}
          </span>
        </header>
        {state.preview ? (
          <>
            <ExchangeSummary diff={state.preview} />
            <ExchangeDetails diff={state.preview} />
            {state.applyResult ? (
              <ApplyResult result={state.applyResult} />
            ) : null}
          </>
        ) : (
          <div className="us-import-skeleton">
            粘贴 JSON / ReqIF 制品后点击预览，先看 diff 再写入内核。
          </div>
        )}
      </article>
    </section>
  );
}

function ExchangeSummary({ diff }: { readonly diff: ExchangeDiff }) {
  const items = [
    ["对象新增", diff.summary.objectsAdded],
    ["对象删除", diff.summary.objectsRemoved],
    ["对象变更", diff.summary.objectsChanged],
    ["关系新增", diff.summary.relationsAdded],
    ["关系删除", diff.summary.relationsRemoved],
    ["关系变更", diff.summary.relationsChanged],
  ] as const;
  return (
    <div className="us-exchange-summary">
      {items.map(([label, value]) => (
        <span key={label}>
          <b className="us-data">{value}</b>
          {label}
        </span>
      ))}
    </div>
  );
}

function ExchangeDetails({ diff }: { readonly diff: ExchangeDiff }) {
  return (
    <div className="us-exchange-details">
      <section>
        <header>对象</header>
        <IdList title="新增" items={diff.objects.added} />
        <IdList title="删除" items={diff.objects.removed} />
        {diff.objects.changed.map((object) => (
          <ChangedObjectView key={object.objectId} object={object} />
        ))}
      </section>
      <section>
        <header>关系</header>
        <IdList title="新增" items={diff.relations.added} />
        <IdList title="删除" items={diff.relations.removed} />
        {diff.relations.changed.map((relation) => (
          <ChangedRelationView key={relation.relationId} relation={relation} />
        ))}
      </section>
    </div>
  );
}

function IdList({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="us-exchange-list">
      <strong>{title}</strong>
      {items.slice(0, 8).map((item) => (
        <span className="us-data" key={item}>
          {item}
        </span>
      ))}
      {items.length > 8 ? <small>+{items.length - 8}</small> : null}
    </div>
  );
}

function ChangedObjectView({
  object,
}: {
  readonly object: ExchangeChangedObject;
}) {
  return (
    <div className="us-exchange-change">
      <strong className="us-data">{object.objectId}</strong>
      <FieldDiffView
        added={Object.keys(object.fields.added).length}
        changed={Object.keys(object.fields.changed).length}
        removed={Object.keys(object.fields.removed).length}
      />
      {object.statusChanged ? <small>状态变更</small> : null}
    </div>
  );
}

function ChangedRelationView({
  relation,
}: {
  readonly relation: ExchangeChangedRelation;
}) {
  return (
    <div className="us-exchange-change">
      <strong className="us-data">{relation.relationId}</strong>
      <FieldDiffView
        added={Object.keys(relation.fields.added).length}
        changed={Object.keys(relation.fields.changed).length}
        removed={Object.keys(relation.fields.removed).length}
      />
      {relation.endpointChanged ? <small>端点变更</small> : null}
    </div>
  );
}

function FieldDiffView({
  added,
  changed,
  removed,
}: {
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
}) {
  return (
    <span>
      字段 +{added} / 改 {changed} / -{removed}
    </span>
  );
}

function ApplyResult({ result }: { readonly result: ExchangeApplyOutcome }) {
  return (
    <section className="us-exchange-apply">
      <header>
        <UsMonoTag tone={result.unapplied.length > 0 ? "change" : "primary"}>
          APPLY
        </UsMonoTag>
        <strong>
          已导入 {result.applied.length} · 跳过 {result.unapplied.length}
        </strong>
      </header>
      {result.applied.length > 0 ? (
        <IdList title="已应用" items={result.applied} />
      ) : null}
      {result.unapplied.map((item) => (
        <article data-unapplied="true" key={item.item}>
          <strong className="us-data">{item.item}</strong>
          <span>
            {item.error.title ?? item.error.message ?? item.error.code}
          </span>
        </article>
      ))}
    </section>
  );
}
