import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";

import type {
  ObjectDetail,
  ReviewAnnotation,
  SelectionRef,
  ViewObject,
} from "@m-next/views";

import { fieldLabel, objectDisplayTitle } from "../display-labels";
import { useToast } from "../toast";
import { useWorkbenchContext } from "./workbench";

export function annotationSeverityLabel(severity: string): string {
  if (severity === "issue") return "问题";
  if (severity === "suggest") return "建议";
  if (severity === "block") return "阻断";
  if (severity === "info") return "评论";
  return severity;
}

export function annotationStatusLabel(status: string): string {
  return status === "resolved" ? "已解决" : "开放";
}

export function selectedAnnotationTarget(
  selected: SelectionRef | null,
): { readonly targetId: string; readonly fieldCode: string | null } | null {
  if (!selected) return null;
  if (selected.entityType === "object") {
    return { targetId: selected.entityId, fieldCode: null };
  }
  if (selected.entityType === "field") {
    return {
      targetId: selected.entityId,
      fieldCode: selected.fieldCode ?? null,
    };
  }
  return null;
}

export function ReviewPanel(): ReactElement {
  const context = useWorkbenchContext();
  const {
    commandClient,
    refreshVersion,
    reportError,
    selection,
    viewClient,
    workspaceId,
  } = context;
  const toast = useToast();
  const [selected, setSelected] = useState<SelectionRef | null>(
    selection.current(),
  );
  const [detail, setDetail] = useState<ObjectDetail | null>(null);
  const [annotations, setAnnotations] = useState<readonly ReviewAnnotation[]>(
    [],
  );
  const [fieldCode, setFieldCode] = useState<string>("");
  const [severity, setSeverity] = useState("issue");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const target = useMemo(() => selectedAnnotationTarget(selected), [selected]);
  const fields = useMemo(() => fieldOptions(detail?.object), [detail]);
  const effectiveFieldCode =
    selected?.entityType === "field" ? (selected.fieldCode ?? "") : fieldCode;

  useEffect(() => selection.subscribe(setSelected), [selection]);

  const loadAnnotations = useCallback(async (): Promise<void> => {
    if (!target) {
      setDetail(null);
      setAnnotations([]);
      return;
    }
    const object = await viewClient.object(workspaceId, target.targetId);
    setDetail(object);
    const objectAnnotations = await viewClient.annotations(
      workspaceId,
      "object",
      target.targetId,
    );
    const fieldAnnotations = await Promise.all(
      fieldOptions(object.object).map((code) =>
        viewClient.annotations(workspaceId, "field", target.targetId, code),
      ),
    );
    setAnnotations([...objectAnnotations, ...fieldAnnotations.flat()]);
  }, [target, viewClient, workspaceId]);

  useEffect(() => {
    void loadAnnotations().catch((error: unknown) =>
      reportError(error instanceof Error ? error.message : "批注加载失败"),
    );
  }, [refreshVersion, reportError, loadAnnotations]);

  async function createAnnotation(): Promise<void> {
    if (!detail || !target || body.trim() === "") return;
    setBusy(true);
    try {
      await commandClient.createAnnotation(workspaceId, {
        targetType: effectiveFieldCode ? "field" : "object",
        targetId: target.targetId,
        fieldCode: effectiveFieldCode || null,
        anchoredDataVersion: detail.object.version,
        severity,
        body: body.trim(),
      });
      setBody("");
      toast.success("批注已创建");
      await loadAnnotations();
    } catch (error) {
      reportError(error instanceof Error ? error.message : "创建批注失败");
    } finally {
      setBusy(false);
    }
  }

  async function changeState(
    annotation: ReviewAnnotation,
    action: "resolve" | "reopen",
  ): Promise<void> {
    setBusy(true);
    try {
      if (action === "resolve") {
        await commandClient.resolveAnnotation(workspaceId, annotation.id);
        toast.success("批注已解决");
      } else {
        await commandClient.reopenAnnotation(workspaceId, annotation.id);
        toast.success("批注已重开");
      }
      await loadAnnotations();
    } catch (error) {
      reportError(error instanceof Error ? error.message : "批注状态更新失败");
    } finally {
      setBusy(false);
    }
  }

  if (!target || !detail) {
    return <aside className="review-panel">请选择对象或字段后添加批注。</aside>;
  }

  return (
    <aside aria-label="评审批注" className="review-panel">
      <section className="review-compose">
        <h3>新建批注</h3>
        <label>
          <span>锚点</span>
          <select
            disabled={selected?.entityType === "field"}
            onChange={(event) => setFieldCode(event.currentTarget.value)}
            value={effectiveFieldCode}
          >
            <option value="">对象: {objectTitle(detail.object)}</option>
            {fields.map((code) => (
              <option key={code} value={code}>
                字段: {fieldLabel(code)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>类型</span>
          <select
            onChange={(event) => setSeverity(event.currentTarget.value)}
            value={severity}
          >
            <option value="issue">问题</option>
            <option value="suggest">建议</option>
            <option value="info">评论</option>
            <option value="block">阻断</option>
          </select>
        </label>
        <textarea
          onChange={(event) => setBody(event.currentTarget.value)}
          placeholder="写下评审意见"
          value={body}
        />
        <button
          disabled={busy || body.trim() === ""}
          onClick={() => void createAnnotation()}
          type="button"
        >
          添加批注
        </button>
      </section>
      <section className="review-list">
        <h3>批注列表</h3>
        {annotations.length === 0 ? (
          <p className="view-empty-state">暂无批注。</p>
        ) : null}
        {annotations.map((annotation) => (
          <AnnotationCard
            annotation={annotation}
            busy={busy}
            key={annotation.id}
            onChangeState={changeState}
          />
        ))}
      </section>
    </aside>
  );
}

function AnnotationCard(props: {
  readonly annotation: ReviewAnnotation;
  readonly busy: boolean;
  readonly onChangeState: (
    annotation: ReviewAnnotation,
    action: "resolve" | "reopen",
  ) => Promise<void>;
}): ReactElement {
  const annotation = props.annotation;
  return (
    <article className={`review-card review-card-${annotation.status}`}>
      <header>
        <strong>{annotationSeverityLabel(annotation.severity)}</strong>
        <span>{annotationStatusLabel(annotation.status)}</span>
      </header>
      <p>{annotation.body}</p>
      <small>
        {annotation.fieldCode ? "字段" : "对象"} · v
        {annotation.anchoredDataVersion} · 创建者
      </small>
      <footer>
        {annotation.status === "open" ? (
          <button
            disabled={props.busy}
            onClick={() => void props.onChangeState(annotation, "resolve")}
            type="button"
          >
            解决
          </button>
        ) : (
          <button
            disabled={props.busy}
            onClick={() => void props.onChangeState(annotation, "reopen")}
            type="button"
          >
            重开
          </button>
        )}
      </footer>
    </article>
  );
}

function fieldOptions(object: ViewObject | undefined): readonly string[] {
  if (!object) return [];
  return Object.keys({ ...object.fields, ...(object.derived ?? {}) });
}

function objectTitle(object: ViewObject): string {
  return objectDisplayTitle(object);
}
