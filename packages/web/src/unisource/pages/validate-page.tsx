import { UsButton } from "../primitives";
import { FullLayout } from "../shell/layouts";
import {
  validationStore,
  useValidationSnapshot,
} from "../state/validation-store";
import { ValidateView } from "../validation/validate-view";

export function ValidatePage() {
  const validation = useValidationSnapshot();
  const errors = validation.results.filter(
    (result) =>
      result.level === "error" && !validation.ignored.has(result.ruleCode),
  ).length;
  const warnings = validation.results.filter(
    (result) =>
      result.level === "warning" && !validation.ignored.has(result.ruleCode),
  ).length;
  return (
    <FullLayout
      chrome={{
        breadcrumb: [{ label: "统一数据源" }, { label: "校验中心" }],
        breadcrumbTail: <span className="us-data">VALIDATE</span>,
        sync: {
          state: errors > 0 ? "danger" : warnings > 0 ? "change" : "ok",
          label: `${errors} 错误 · ${warnings} 警告 · ${validation.results.length} 条规则`,
        },
        actions: (
          <UsButton onClick={() => validationStore.runAll()} variant="emphasis">
            立即运行
          </UsButton>
        ),
      }}
    >
      <ValidateView />
    </FullLayout>
  );
}
