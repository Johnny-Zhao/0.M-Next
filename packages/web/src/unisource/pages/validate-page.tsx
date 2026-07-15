import { UsButton } from "../primitives";
import { FullLayout } from "../shell/layouts";
import { useSessionSnapshot } from "../state/session-store";
import {
  validationStore,
  useValidationSnapshot,
} from "../state/validation-store";
import { ValidateView } from "../validation/validate-view";

export function ValidatePage() {
  const validation = useValidationSnapshot();
  const session = useSessionSnapshot();
  const results =
    validation.source === "kernel"
      ? validation.kernelResults
      : validation.results;
  const errors = results.filter(
    (result) =>
      result.level === "error" &&
      (validation.source === "kernel" ||
        !validation.ignored.has(result.ruleCode)),
  ).length;
  const warnings = results.filter(
    (result) =>
      result.level === "warning" &&
      (validation.source === "kernel" ||
        !validation.ignored.has(result.ruleCode)),
  ).length;
  return (
    <FullLayout
      chrome={{
        breadcrumb: [{ label: "统一数据源" }, { label: "校验中心" }],
        breadcrumbTail: <span className="us-data">VALIDATE</span>,
        sync: {
          state:
            validation.source === "kernel" && validation.kernelStatus === "idle"
              ? "offline"
              : validation.kernelStatus === "error" || errors > 0
                ? "danger"
                : validation.kernelRunning || warnings > 0
                  ? "change"
                  : "ok",
          label:
            validation.source === "kernel" && validation.kernelStatus === "idle"
              ? "尚未校验"
              : `${errors} 错误 · ${warnings} 警告 · ${results.length} 条结果`,
        },
        actions: (
          <UsButton
            disabled={validation.kernelRunning}
            onClick={() => {
              if (validation.source === "kernel") {
                void validationStore.runKernelCheck(session.currentMemberId);
              } else {
                validationStore.runAll();
              }
            }}
            variant="emphasis"
          >
            立即运行
          </UsButton>
        ),
      }}
    >
      <ValidateView />
    </FullLayout>
  );
}
