export const STARTED_MARKER = "Started MNextApplication";
export const FAILED_MARKER = "Application run failed";

export function evaluateServerReadiness({ healthReady, javaRunning, log }) {
  if (log.includes(FAILED_MARKER)) {
    return { state: "failed", detail: firstServerException(log) };
  }
  if (!javaRunning) return { state: "exited", detail: null };
  if (healthReady && log.includes(STARTED_MARKER)) {
    return { state: "ready", detail: null };
  }
  return { state: "waiting", detail: null };
}

function firstServerException(log) {
  return (
    log
      .split(/\r?\n/)
      .find((line) => /(?:Exception|Error):/.test(line))
      ?.trim() ?? null
  );
}
