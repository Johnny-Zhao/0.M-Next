import { useEffect, useMemo, useState } from "react";

import { projectSpaceRole } from "../access/space-role";
import { useKernelRuntimeState } from "../data/boot-mode";
import {
  annotationFromComment,
  type Annotation,
  type AnnotationSeverity,
} from "../data/gateway";
import type { DataObject, DataRelation, SelectionRef } from "../model/kernel";
import { UsButton, UsDrawer, UsMonoTag } from "../primitives";
import {
  annotationsStore,
  useAnnotationsSnapshot,
} from "../state/annotations-store";
import { useSessionSnapshot } from "../state/session-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";

const SEVERITY_LABEL: Record<AnnotationSeverity, string> = {
  info: "提示",
  warn: "警告",
  block: "阻断",
};

export function AnnotationDrawer({
  open,
  onClose,
  target,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly target?: SelectionRef | null;
}) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const kernelRuntime = useKernelRuntimeState();
  const annotationState = useAnnotationsSnapshot();
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<AnnotationSeverity>("info");
  const targetKey = target ? selectionKey(target) : "";
  const role = projectSpaceRole(session.currentMemberId, workspace.permissions);
  const canWrite =
    kernelRuntime.backend && role !== "VIEWER" && Boolean(target);
  const targetLabel = target
    ? describeSelection(workspace, target)
    : "未选择目标";
  const annotations = useMemo(() => {
    if (kernelRuntime.backend) return annotationState.kernelAnnotations;
    return workspace.comments
      .map(annotationFromComment)
      .filter((annotation) =>
        target ? sameSelection(annotation.anchor, target) : true,
      );
  }, [
    annotationState.kernelAnnotations,
    kernelRuntime.backend,
    target,
    workspace.comments,
  ]);

  useEffect(() => {
    if (!open || !kernelRuntime.backend) return;
    void annotationsStore.refresh(target ?? undefined, session.currentMemberId);
  }, [kernelRuntime.backend, open, session.currentMemberId, targetKey, target]);

  const submit = () => {
    const text = body.trim();
    if (!target || !text || !canWrite) return;
    void annotationsStore.create(
      {
        target,
        body: text,
        severity,
        anchoredDataVersion: dataVersionForTarget(workspace, target),
      },
      session.currentMemberId,
    );
    setBody("");
    setSeverity("info");
  };

  return (
    <UsDrawer
      open={open}
      onClose={onClose}
      title="评审批注"
      headerExtra={<UsMonoTag active={kernelRuntime.backend}>REVIEW</UsMonoTag>}
    >
      <section className="us-annotation">
        <header className="us-annotation__target">
          <span>
            <small>当前锚点</small>
            <strong>{targetLabel}</strong>
          </span>
          <UsMonoTag>{kernelRuntime.backend ? "KERNEL" : "MOCK"}</UsMonoTag>
        </header>

        {canWrite ? (
          <div className="us-annotation__composer">
            <label>
              <span>严重度</span>
              <select
                onChange={(event) =>
                  setSeverity(event.currentTarget.value as AnnotationSeverity)
                }
                value={severity}
              >
                <option value="info">提示</option>
                <option value="warn">警告</option>
                <option value="block">阻断</option>
              </select>
            </label>
            <label>
              <span>批注内容</span>
              <textarea
                onChange={(event) => setBody(event.currentTarget.value)}
                placeholder="写下需要审阅的人能直接处理的意见"
                rows={4}
                value={body}
              />
            </label>
            <UsButton
              disabled={
                !body.trim() || annotationState.busy || !kernelRuntime.backend
              }
              onClick={submit}
              variant="primary"
            >
              新建内核批注
            </UsButton>
            {!kernelRuntime.backend ? (
              <p className="us-annotation__note">
                Mock 模式只展示 seed 批注，不写入内核。
              </p>
            ) : null}
          </div>
        ) : (
          <p className="us-annotation__readonly">
            {!kernelRuntime.backend
              ? "Mock 模式只展示 seed 批注，不写入内核。"
              : target
                ? "当前身份仅可查看批注。"
                : "请选择对象、字段或关系后再新建批注。"}
          </p>
        )}

        <AnnotationList
          annotations={annotations}
          busy={annotationState.busy}
          canWrite={canWrite}
          onResolve={(annotationId) =>
            void annotationsStore.resolve(
              annotationId,
              target ?? undefined,
              session.currentMemberId,
            )
          }
          onReopen={(annotationId) =>
            void annotationsStore.reopen(
              annotationId,
              target ?? undefined,
              session.currentMemberId,
            )
          }
          workspace={workspace}
        />
      </section>
    </UsDrawer>
  );
}

function AnnotationList({
  annotations,
  busy,
  canWrite,
  onResolve,
  onReopen,
  workspace,
}: {
  readonly annotations: readonly Annotation[];
  readonly busy: boolean;
  readonly canWrite: boolean;
  readonly onResolve: (annotationId: string) => void;
  readonly onReopen: (annotationId: string) => void;
  readonly workspace: ReturnType<typeof useWorkspaceSnapshot>;
}) {
  if (busy && annotations.length === 0) {
    return <p className="us-annotation__empty">正在同步批注...</p>;
  }
  if (annotations.length === 0) {
    return <p className="us-annotation__empty">当前锚点暂无批注。</p>;
  }
  return (
    <div className="us-annotation__list">
      {annotations.map((annotation) => (
        <article
          className="us-annotation-card"
          data-resolved={annotation.resolved}
          data-severity={annotation.severity}
          key={annotation.id}
        >
          <header>
            <span>
              <UsMonoTag tone={severityTone(annotation.severity)}>
                {SEVERITY_LABEL[annotation.severity]}
              </UsMonoTag>
              <strong>{memberName(workspace, annotation.author)}</strong>
            </span>
            <time className="us-data">{annotation.at}</time>
          </header>
          <p>{annotation.body}</p>
          <footer>
            <span>{describeSelection(workspace, annotation.anchor)}</span>
            <span className="us-data">v{annotation.anchoredDataVersion}</span>
            {annotation.resolved ? (
              <UsMonoTag>已解决</UsMonoTag>
            ) : (
              <UsMonoTag active tone="change">
                OPEN
              </UsMonoTag>
            )}
            {canWrite ? (
              annotation.resolved ? (
                <button onClick={() => onReopen(annotation.id)} type="button">
                  重开
                </button>
              ) : (
                <button onClick={() => onResolve(annotation.id)} type="button">
                  解决
                </button>
              )
            ) : null}
          </footer>
        </article>
      ))}
    </div>
  );
}

function selectionKey(selection: SelectionRef): string {
  return `${selection.entityType}:${selection.entityId}:${selection.fieldCode ?? ""}`;
}

function sameSelection(left: SelectionRef, right: SelectionRef): boolean {
  return selectionKey(left) === selectionKey(right);
}

function dataVersionForTarget(
  workspace: ReturnType<typeof useWorkspaceSnapshot>,
  target: SelectionRef,
): number {
  if (target.entityType === "relation") {
    return (
      workspace.relations.find((relation) => relation.id === target.entityId)
        ?.version ?? 1
    );
  }
  return (
    workspace.objects.find((object) => object.id === target.entityId)
      ?.version ?? 1
  );
}

function describeSelection(
  workspace: ReturnType<typeof useWorkspaceSnapshot>,
  target: SelectionRef,
): string {
  if (target.entityType === "relation") {
    const relation = workspace.relations.find(
      (candidate) => candidate.id === target.entityId,
    );
    return relation
      ? describeRelation(workspace.objects, relation)
      : target.entityId;
  }
  const object = workspace.objects.find(
    (candidate) => candidate.id === target.entityId,
  );
  const name = object ? objectName(object) : target.entityId;
  return target.entityType === "field" && target.fieldCode
    ? `${name} / ${target.fieldCode}`
    : name;
}

function objectName(object: DataObject): string {
  const raw = object.fields.name?.value ?? object.fields.title?.value;
  return typeof raw === "string" && raw.trim() ? raw : object.id;
}

function describeRelation(
  objects: readonly DataObject[],
  relation: DataRelation,
): string {
  const source = objects.find((object) => object.id === relation.sourceId);
  const target = objects.find((object) => object.id === relation.targetId);
  return `${source ? objectName(source) : relation.sourceId} -> ${
    target ? objectName(target) : relation.targetId
  }`;
}

function memberName(
  workspace: ReturnType<typeof useWorkspaceSnapshot>,
  memberId: string,
): string {
  return (
    workspace.members.find((member) => member.id === memberId)?.name ?? memberId
  );
}

function severityTone(
  severity: AnnotationSeverity,
): "primary" | "change" | "danger" | undefined {
  if (severity === "info") return "primary";
  if (severity === "warn") return "change";
  return "danger";
}
