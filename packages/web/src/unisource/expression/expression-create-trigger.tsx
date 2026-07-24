import { UsButton } from "../primitives";
import { openExpressionCreateDialog } from "./expression-create-dialog-store";

export function ExpressionCreateTrigger({
  surface,
}: {
  readonly surface: "sidebar" | "home";
}) {
  return (
    <UsButton
      className={`us-expression-create-trigger us-expression-create-trigger--${surface}`}
      onClick={openExpressionCreateDialog}
      variant={surface === "home" ? "primary" : "ghost"}
    >
      {surface === "sidebar" ? "+ 新建表达" : "新建表达"}
    </UsButton>
  );
}
