import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { UnisourceApp } from "./app";
import {
  clearBrowserBackendPreference,
  persistBrowserBootMode,
  resolveBrowserBootMode,
  setKernelRuntimeState,
  type BootMode,
} from "./data/boot-mode";
import {
  KernelGateway,
  type KernelGatewayLoadReport,
} from "./data/kernel-gateway";
import { KernelWriteBridge } from "./data/write-bridge";
import { applyDemoSeed, configureBackendReload } from "./state/demo-reset";
import { changeSetStore } from "./state/changeset-store";
import { outputsStore } from "./state/outputs-store";
import { sessionStore } from "./state/session-store";
import { validationStore } from "./state/validation-store";
import { workspaceStore } from "./state/workspace-store";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("root element is missing");
}

document.title = "同源 UniSource";
document.body.classList.add("us-body");

const root = createRoot(rootElement);
const bootMode = resolveBrowserBootMode();
persistBrowserBootMode(bootMode);

void boot(root, bootMode);

async function boot(root: Root, mode: BootMode): Promise<void> {
  if (!mode.backend) {
    configureBackendReload(null);
    workspaceStore.setWriteSink(null);
    validationStore.setKernelSource(null);
    changeSetStore.setKernelSource(null);
    outputsStore.setKernelSource(null);
    setKernelRuntimeState({
      backend: false,
      workspaceId: null,
      reportLabel: null,
    });
    renderApp(root);
    return;
  }
  if (!mode.workspaceId) {
    renderBootError(
      root,
      "缺少 workspaceId，请在 URL 中追加 ?backend=1&ws=<id>。",
      () => fallbackToMock(root),
    );
    return;
  }
  const workspaceId = mode.workspaceId;
  const initialActor = sessionStore.getSnapshot().currentMemberId;
  const gateway = new KernelGateway("", workspaceId, initialActor);
  const writeBridge = new KernelWriteBridge(gateway);
  const load = async (notify: boolean): Promise<void> => {
    const seed = await gateway.loadWorkspace();
    const report = gateway.getLastLoadReport();
    applyDemoSeed(seed, notify ? { toastTitle: "已从内核重载工作空间" } : {});
    workspaceStore.setWriteSink(writeBridge);
    validationStore.setKernelSource(gateway);
    changeSetStore.setKernelSource(gateway);
    outputsStore.setKernelSource(gateway);
    void changeSetStore.refreshKernelAiChanges(
      sessionStore.getSnapshot().currentMemberId,
    );
    setKernelRuntimeState({
      backend: true,
      workspaceId,
      reportLabel: report ? formatReport(report) : null,
    });
  };
  configureBackendReload(() => load(true));
  renderBootLoading(root, workspaceId);
  try {
    await load(false);
    renderApp(root);
  } catch (error) {
    renderBootError(root, errorMessage(error), () => {
      renderBootLoading(root, workspaceId);
      void boot(root, mode);
    });
  }
}

function renderApp(root: Root): void {
  root.render(
    <StrictMode>
      <UnisourceApp />
    </StrictMode>,
  );
}

function renderBootLoading(root: Root, workspaceId: string): void {
  root.render(
    <section className="us-boot" aria-live="polite">
      <div className="us-boot__card">
        <strong>UniSource</strong>
        <span className="us-data">KERNEL · {shortId(workspaceId)}</span>
        <p>正在从内核装载工作空间...</p>
      </div>
    </section>,
  );
}

function renderBootError(
  root: Root,
  message: string,
  onRetry: () => void,
): void {
  root.render(
    <section className="us-boot" role="alert">
      <div className="us-boot__card" data-tone="danger">
        <strong>内核工作空间装载失败</strong>
        <p>{message}</p>
        <div className="us-boot__actions">
          <button onClick={onRetry} type="button">
            重试
          </button>
          <button onClick={() => fallbackToMock(root)} type="button">
            回退 Mock 模式
          </button>
        </div>
      </div>
    </section>,
  );
}

function fallbackToMock(root: Root): void {
  clearBrowserBackendPreference();
  configureBackendReload(null);
  workspaceStore.setWriteSink(null);
  validationStore.setKernelSource(null);
  changeSetStore.setKernelSource(null);
  outputsStore.setKernelSource(null);
  setKernelRuntimeState({
    backend: false,
    workspaceId: null,
    reportLabel: null,
  });
  renderApp(root);
}

function formatReport(report: KernelGatewayLoadReport): string {
  return `${report.objectCount} objects · ${report.relationCount} relations · ${report.unmatchedRefs} dangling`;
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
