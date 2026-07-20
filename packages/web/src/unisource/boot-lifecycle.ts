export async function renderWorkspaceBeforeKernelHydration(
  loadWorkspace: () => Promise<void>,
  renderWorkspace: () => void,
  hydrateKernelCheck: () => Promise<unknown>,
): Promise<void> {
  await loadWorkspace();
  renderWorkspace();
  void hydrateKernelCheck().catch(() => undefined);
}
