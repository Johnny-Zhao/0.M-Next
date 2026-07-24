import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { UnisourceApp } from "./app";
import { renderWorkspaceBeforeKernelHydration } from "./boot-lifecycle";
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
import { MOCK_GATEWAY_CAPABILITIES } from "./data/gateway";
import { MockUnisourceGateway } from "./data/mock-gateway";
import { KernelWriteBridge } from "./data/write-bridge";
import { annotationsStore } from "./state/annotations-store";
import { applyDemoSeed, configureBackendReload } from "./state/demo-reset";
import { changeSetStore } from "./state/changeset-store";
import { lineageStore } from "./state/lineage-store";
import { outputsStore } from "./state/outputs-store";
import { sessionStore } from "./state/session-store";
import { structuredImportStore } from "./state/structured-import-store";
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
    const expressionGateway = new MockUnisourceGateway(
      undefined,
      workspaceStore,
    );
    sessionStore.setPermissionSource("demo");
    configureBackendReload(null);
    workspaceStore.setWriteSink(null);
    validationStore.setKernelSource(null);
    changeSetStore.setKernelSource(null);
    outputsStore.setKernelSource(null);
    annotationsStore.setKernelSource(null);
    structuredImportStore.setKernelSource(null);
    lineageStore.setKernelSource(null);
    setKernelRuntimeState({
      backend: false,
      workspaceId: null,
      templateCode: null,
      reportLabel: null,
      gatewayCapabilities: MOCK_GATEWAY_CAPABILITIES,
      expressionGateway,
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
  const gateway = new KernelGateway(
    "",
    workspaceId,
    initialActor,
  ).attachExpressionStore(workspaceStore);
  const writeBridge = new KernelWriteBridge(gateway, {
    onKernelWriteSucceeded: (actor) =>
      validationStore.scheduleAutoKernelCheck(actor),
  });
  const load = async (notify: boolean): Promise<void> => {
    const seed = await gateway.loadWorkspace();
    const report = gateway.getLastLoadReport();
    sessionStore.setPermissionSource("kernel");
    applyDemoSeed(seed, notify ? { toastTitle: "已从内核重载工作空间" } : {});
    workspaceStore.setWriteSink(writeBridge);
    validationStore.setKernelSource(gateway);
    changeSetStore.setKernelSource(gateway, (actor) =>
      validationStore.scheduleAutoKernelCheck(actor),
    );
    outputsStore.setKernelSource(gateway);
    annotationsStore.setKernelSource(gateway);
    structuredImportStore.setKernelSource(gateway, async () => {
      await load(true);
      validationStore.scheduleAutoKernelCheck(
        sessionStore.getSnapshot().currentMemberId,
      );
    });
    lineageStore.setKernelSource(gateway);
    void changeSetStore.refreshKernelAiChanges(
      sessionStore.getSnapshot().currentMemberId,
    );
    setKernelRuntimeState({
      backend: true,
      workspaceId,
      templateCode: gateway.getWorkspaceTemplateCode(),
      reportLabel: report ? formatReport(report) : null,
      gatewayCapabilities: gateway.capabilities,
      expressionGateway: gateway,
    });
  };
  const hydrateKernelCheck = (): Promise<boolean> =>
    validationStore.hydrateKernelCheck();
  configureBackendReload(async () => {
    await load(true);
    void hydrateKernelCheck().catch(() => undefined);
  });
  renderBootLoading(root, workspaceId);
  try {
    await renderWorkspaceBeforeKernelHydration(
      () => load(false),
      () => renderApp(root),
      hydrateKernelCheck,
    );
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
  const expressionGateway = new MockUnisourceGateway(undefined, workspaceStore);
  clearBrowserBackendPreference();
  sessionStore.setPermissionSource("demo");
  configureBackendReload(null);
  workspaceStore.setWriteSink(null);
  validationStore.setKernelSource(null);
  changeSetStore.setKernelSource(null);
  outputsStore.setKernelSource(null);
  annotationsStore.setKernelSource(null);
  structuredImportStore.setKernelSource(null);
  lineageStore.setKernelSource(null);
  setKernelRuntimeState({
    backend: false,
    workspaceId: null,
    templateCode: null,
    reportLabel: null,
    gatewayCapabilities: MOCK_GATEWAY_CAPABILITIES,
    expressionGateway,
  });
  renderApp(root);
}

function formatReport(report: KernelGatewayLoadReport): string {
  const relationFailures = report.relationLoadFailures
    ? ` · ${report.relationLoadFailures} relation reads failed`
    : "";
  return `${report.objectCount} objects · ${report.relationCount} relations · ${report.unmatchedRefs} dangling${relationFailures}`;
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
