import { useMemo, useState, type ReactNode } from "react";

import { useKernelRuntimeState } from "../data/boot-mode";
import type { ChangeSet } from "../model/kernel";
import type { RawImport } from "../model/view-layer";
import { IconSpark, UsButton, UsMonoTag, pushToast } from "../primitives";
import { useSessionSnapshot } from "../state/session-store";
import { changeSetStore, useChangeSetSnapshot } from "../state/changeset-store";
import { useWorkspaceSnapshot, workspaceStore } from "../state/workspace-store";
import { ImportSteps } from "./import-steps";
import { buildImportViewModel } from "./import-view-model";
import { SemanticChips } from "./semantic-chips";
import { TargetDiffList } from "./target-diff-list";

export function ImportView() {
  const workspace = useWorkspaceSnapshot();
  const changeSets = useChangeSetSnapshot();
  const session = useSessionSnapshot();
  const kernelRuntime = useKernelRuntimeState();
  const [parsed, setParsed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const aiSet = changeSets.changeSets.find(
    (changeSet) => changeSet.id === "changeset-ai-quote",
  );
  const effectiveConfirmed = useMemo(() => {
    const next = new Set(confirmedIds);
    for (const item of aiSet?.items ?? []) {
      if (item.confirmed) next.add(item.id);
    }
    return next;
  }, [aiSet, confirmedIds]);
  const vm = buildImportViewModel({
    workspace,
    changeSet: aiSet,
    confirmedIds: effectiveConfirmed,
  });

  const parse = () => {
    setLoading(true);
    window.setTimeout(() => {
      setParsed(true);
      setLoading(false);
    }, 800);
  };
  const confirm = () => {
    if (!aiSet || !vm.canConfirm) return;
    const before = workspaceStore.getChangeEvents().length;
    const result = changeSetStore.acceptItems(aiSet.id, vm.confirmableItemIds);
    const written = workspaceStore.getChangeEvents().length - before;
    if (result.ok) {
      pushToast({
        title: `已写入 · ${written} 处引用已同步`,
        actions: [
          {
            label: "撤销",
            tone: "gold",
            onPress: () => {
              const latest = workspaceStore.getChangeEvents()[0];
              if (latest) workspaceStore.undo(latest.id);
            },
          },
        ],
      });
    }
  };
  const syncKernel = () => {
    void changeSetStore.refreshKernelAiChanges(session.currentMemberId);
  };
  const confirmKernel = (changeSetId: string, itemIds: readonly string[]) => {
    void changeSetStore.confirmKernelItems(
      changeSetId,
      itemIds,
      session.currentMemberId,
    );
  };
  const rejectKernel = (changeSetId: string) => {
    void changeSetStore.rejectKernel(changeSetId, session.currentMemberId);
  };

  return (
    <section className="us-import">
      <ImportSteps steps={vm.steps} />
      <div className="us-import__body">
        <article className="us-import-card us-import-raw">
          <header>
            <strong>粘贴文本</strong>
            <span>文件 xlsx · pdf · img</span>
            <a href="/us/expr/exp-dashboard?form=bi&drawer=chat">AI 对话</a>
          </header>
          <p>{renderRaw(workspace.rawImport)}</p>
          <div className="us-aiprompt">
            <IconSpark size={14} />
            <span>解析报价邮件,定位要写入的数据</span>
            <UsButton onClick={parse} size="sm" variant="emphasis">
              解析 Parse
            </UsButton>
          </div>
          <footer>
            {workspace.rawImport.recent.map((item) => (
              <UsMonoTag key={item.id}>{item.title}</UsMonoTag>
            ))}
          </footer>
        </article>
        <article className="us-import-card">
          <header>
            <strong>解析结果</strong>
            <span>
              增 {vm.addCount} · 改 {vm.changeCount} · 跳过 {vm.skipCount}
            </span>
          </header>
          {loading || !parsed ? (
            <div className="us-import-skeleton">AI 正在解析…</div>
          ) : (
            <>
              <SemanticChips chips={workspace.rawImport.semanticChips} />
              <TargetDiffList
                confirmedIds={effectiveConfirmed}
                onToggleConfirm={(itemId) =>
                  setConfirmedIds((current) => {
                    const next = new Set(current);
                    if (next.has(itemId)) next.delete(itemId);
                    else next.add(itemId);
                    return next;
                  })
                }
                vm={vm}
              />
              <footer className="us-import-actions">
                <UsMonoTag tone={vm.pendingCount > 0 ? "change" : "primary"}>
                  待写入 {vm.pendingCount}
                </UsMonoTag>
                <UsButton
                  onClick={() => {
                    const first = document.querySelector(
                      ".us-targetdiff article[data-status='needsConfirm']",
                    );
                    first?.scrollIntoView({ block: "center" });
                  }}
                  size="sm"
                  variant="secondary"
                >
                  逐项审核
                </UsButton>
                <UsButton
                  disabled={!vm.canConfirm}
                  onClick={confirm}
                  size="sm"
                  title={vm.disabledReason ?? undefined}
                  variant="primary"
                >
                  ✓ 确认写入
                </UsButton>
              </footer>
              {kernelRuntime.backend ? (
                <KernelAiChangeSetsPanel
                  busy={changeSets.kernelBusy}
                  changeSets={changeSets.kernelChangeSets}
                  onConfirm={confirmKernel}
                  onReject={rejectKernel}
                  onSync={syncKernel}
                  syncAt={changeSets.kernelSyncAt}
                />
              ) : null}
            </>
          )}
        </article>
      </div>
    </section>
  );
}

function KernelAiChangeSetsPanel(props: {
  readonly busy: boolean;
  readonly changeSets: readonly ChangeSet[];
  readonly syncAt: string | null;
  readonly onSync: () => void;
  readonly onConfirm: (changeSetId: string, itemIds: readonly string[]) => void;
  readonly onReject: (changeSetId: string) => void;
}) {
  return (
    <section className="us-targetdiff" aria-label="内核 AI 变更集">
      <section>
        <header>
          <div>
            <UsMonoTag tone="primary">KERNEL AI</UsMonoTag>
            <strong>内核 AI 变更集(权威)</strong>
          </div>
          <UsButton
            disabled={props.busy}
            onClick={props.onSync}
            size="sm"
            variant="secondary"
          >
            {props.busy ? "同步中" : "同步"}
          </UsButton>
        </header>
        {props.changeSets.length === 0 ? (
          <article>
            <small>
              暂无内核待确认项
              {props.syncAt ? ` · ${props.syncAt}` : ""}
            </small>
          </article>
        ) : (
          props.changeSets.map((changeSet) => {
            const openItemIds = changeSet.items
              .filter((item) => item.confirmed !== true)
              .map((item) => item.id);
            return (
              <article data-confidence="change" key={changeSet.id}>
                <div>
                  <b>{changeSet.title}</b>
                  <small>
                    {changeSetStatusLabel(changeSet.status)} ·{" "}
                    {changeSet.items.length} 项 · {changeSet.createdAt}
                  </small>
                </div>
                {changeSet.items.slice(0, 3).map((item) => (
                  <label key={item.id}>
                    {item.note ?? item.op}
                    <span className="us-data"> {item.id.slice(0, 8)}</span>
                  </label>
                ))}
                <footer className="us-import-actions">
                  <UsButton
                    disabled={props.busy || openItemIds.length === 0}
                    onClick={() => props.onConfirm(changeSet.id, openItemIds)}
                    size="sm"
                    variant="primary"
                  >
                    确认所列项
                  </UsButton>
                  <UsButton
                    disabled={props.busy}
                    onClick={() => props.onReject(changeSet.id)}
                    size="sm"
                    variant="secondary"
                  >
                    拒绝
                  </UsButton>
                </footer>
              </article>
            );
          })
        )}
      </section>
    </section>
  );
}

function changeSetStatusLabel(status: ChangeSet["status"]): string {
  if (status === "resolved") return "已确认";
  if (status === "rejected") return "已拒绝";
  return "待确认";
}

function renderRaw(raw: RawImport) {
  const sorted = [...raw.spans].sort((left, right) => left.start - right.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((span, index) => {
    if (span.start > cursor) {
      nodes.push(
        <span key={`text-${index}`}>{raw.text.slice(cursor, span.start)}</span>,
      );
    }
    nodes.push(
      <mark data-tone={span.tone} key={`mark-${index}`}>
        {raw.text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });
  if (cursor < raw.text.length)
    nodes.push(<span key="tail">{raw.text.slice(cursor)}</span>);
  return nodes;
}
