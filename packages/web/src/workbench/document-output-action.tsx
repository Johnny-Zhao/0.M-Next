import { useState, type ReactElement } from "react";

import type { OutputDetail, OutputFormat, ViewClient } from "@m-next/views";

import { useToast } from "../toast";

const outputFormats: readonly OutputFormat[] = ["markdown", "docx", "pdf"];

const extensions: Readonly<Record<OutputFormat, string>> = {
  csv: "csv",
  docx: "docx",
  html: "html",
  markdown: "md",
  pdf: "pdf",
  xlsx: "xlsx",
};

const mediaTypes: Readonly<Record<OutputFormat, string>> = {
  csv: "text/csv;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html;charset=utf-8",
  markdown: "text/markdown;charset=utf-8",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export interface DocumentOutputActionProps {
  readonly actorId: string;
  readonly objectType: string;
  readonly reportError: (message: string) => void;
  readonly viewClient: Pick<
    ViewClient,
    "captureSnapshot" | "createOutput" | "getOutput"
  >;
  readonly workspaceId: string;
  readonly download?: (detail: OutputDetail) => void;
}

export interface GenerateDocumentOutputOptions {
  readonly actorId: string;
  readonly format: OutputFormat;
  readonly objectType: string;
  readonly viewClient: Pick<
    ViewClient,
    "captureSnapshot" | "createOutput" | "getOutput"
  >;
  readonly workspaceId: string;
}

export async function generateDocumentOutput({
  actorId,
  format,
  objectType,
  viewClient,
  workspaceId,
}: GenerateDocumentOutputOptions): Promise<OutputDetail> {
  const scope = objectType.trim() || null;
  const snapshot = await viewClient.captureSnapshot(
    workspaceId,
    actorId,
    scope,
  );
  const output = await viewClient.createOutput(workspaceId, actorId, {
    snapshotId: snapshot.snapshotId,
    format,
    objectType: scope,
  });
  return viewClient.getOutput(workspaceId, output.outputId);
}

export function DocumentOutputAction({
  actorId,
  download = downloadOutput,
  objectType,
  reportError,
  viewClient,
  workspaceId,
}: DocumentOutputActionProps): ReactElement {
  const toast = useToast();
  const [format, setFormat] = useState<OutputFormat>("markdown");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  async function generate(): Promise<void> {
    setGenerating(true);
    setMessage("");
    try {
      const detail = await generateDocumentOutput({
        actorId,
        format,
        objectType,
        viewClient,
        workspaceId,
      });
      download(detail);
      const outputName = filename(detail.meta.format, detail.meta.outputId);
      setMessage(`已生成 ${outputName}`);
      toast.success(`已导出 ${outputName}`);
    } catch (error) {
      reportError(error instanceof Error ? error.message : "生成文档失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="document-output-action" aria-live="polite">
      <label>
        生成文档
        <select
          onChange={(event) =>
            setFormat(event.currentTarget.value as OutputFormat)
          }
          value={format}
        >
          {outputFormats.map((value) => (
            <option key={value} value={value}>
              {value.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={generating}
        onClick={() => void generate()}
        type="button"
      >
        {generating ? "生成中..." : "导出"}
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}

export function downloadOutput(detail: OutputDetail): void {
  const blob = new Blob([base64Bytes(detail.artifact)], {
    type: mediaTypes[detail.meta.format],
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename(detail.meta.format, detail.meta.outputId);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function filename(format: OutputFormat, outputId: string): string {
  return `mnext-output-${outputId}.${extensions[format]}`;
}

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
