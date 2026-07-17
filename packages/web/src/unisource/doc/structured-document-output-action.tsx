import { useKernelRuntimeState } from "../data/boot-mode";
import { UsButton, UsMonoTag } from "../primitives";
import { useSessionSnapshot } from "../state/session-store";
import { outputsStore, useOutputsSnapshot } from "../state/outputs-store";
import { useValidationSnapshot } from "../state/validation-store";
import type { StructuredDocumentOutputConfig } from "./structured-document-view-model";

export function StructuredDocumentOutputAction({
  config,
  rootObjectId,
  title,
}: {
  readonly config: StructuredDocumentOutputConfig;
  readonly rootObjectId: string;
  readonly title: string;
}) {
  const runtime = useKernelRuntimeState();
  const session = useSessionSnapshot();
  const output = useOutputsSnapshot();
  const validation = useValidationSnapshot();
  const reason = exportDisabledReason(runtime.backend, output.busy, validation);

  return (
    <div className="us-structured-doc__output" data-busy={output.busy}>
      <span>
        {output.busy ? "正在创建快照并生成 DOCX…" : "从不可变快照生成 DOCX"}
      </span>
      <UsButton
        disabled={reason !== null}
        onClick={() => {
          if (reason) return;
          void outputsStore.exportToKernel(
            config.format,
            outputScope(config, rootObjectId, title),
            session.currentMemberId,
          );
        }}
        size="sm"
        title={reason ?? undefined}
        variant="primary"
      >
        {output.busy ? "生成中" : "生成 DOCX"}
      </UsButton>
      {reason ? <small>{reason}</small> : null}
      {output.lastOutput ? (
        <span>
          <small>制品：{output.lastOutput.outputId}</small>
          <UsMonoTag>{outputCheckStatusLabel(output.lastOutput.checkStatus)}</UsMonoTag>
          <UsMonoTag>{outputReviewStatusLabel(output.lastOutput.reviewStatus)}</UsMonoTag>
        </span>
      ) : null}
    </div>
  );
}

export function outputCheckStatusLabel(status: string | undefined): string {
  return (
    {
      BLOCK: "有阻断",
      WARN: "有警告",
      OK: "通过",
      UNCHECKED: "未校验",
      UNKNOWN: "未记录",
    }[status?.toUpperCase() ?? "UNKNOWN"] ?? "未记录"
  );
}

export function outputReviewStatusLabel(status: string | undefined): string {
  return (
    {
      UNREVIEWED: "未评审",
      UNKNOWN: "未记录",
    }[status?.toUpperCase() ?? "UNKNOWN"] ?? "未记录"
  );
}

function exportDisabledReason(
  backend: boolean,
  busy: boolean,
  validation: ReturnType<typeof useValidationSnapshot>,
): string | null {
  if (!backend) return "DOCX 只能由后端快照生成";
  if (busy) return "正在生成制品";
  if (validation.source === "kernel" && validation.kernelStatus !== "ready") {
    return validation.kernelStatus === "running"
      ? "校验正在执行，请完成后再生成快照"
      : "请先完成当前工作空间校验";
  }
  return null;
}

function outputScope(
  config: StructuredDocumentOutputConfig,
  rootObjectId: string,
  title: string,
) {
  return {
    objectType: null,
    fieldOrder: config.fieldOrder,
    fileBaseName: title,
    sectionMapping: config.sectionMapping,
    treeScope: config.relationType
      ? {
          rootId: rootObjectId,
          relationType: config.relationType,
          maxDepth: config.maxDepth,
          relatedRelationTypes: config.relatedRelationTypes,
        }
      : null,
  };
}
