import type {
  CreateObjectFormValues,
  CreateObjectKind,
} from "./create-object-form";

export type DiagramPaletteKind = CreateObjectKind;

export const diagramToolRefreshDelayMs = 400;

export const diagramPaletteItems: readonly {
  readonly kind: DiagramPaletteKind;
  readonly label: string;
  readonly description: string;
}[] = [
  { kind: "system", label: "分系统", description: "挂到方案根" },
  { kind: "module", label: "组件", description: "挂到方案根" },
  { kind: "interface", label: "接口", description: "用于模块接口关系" },
  { kind: "requirement", label: "需求", description: "用于需求覆盖" },
];

export function paletteObjectForm(
  kind: DiagramPaletteKind,
  existingRequirements: number,
): CreateObjectFormValues {
  if (kind === "system") {
    return { kind, values: { name: "新建分系统", responsibility: "" } };
  }
  if (kind === "module") {
    return {
      kind,
      values: { name: "新建组件", responsibility: "", power_w: "0" },
    };
  }
  if (kind === "interface") {
    return {
      kind,
      values: { name: "新建接口", direction: "out", protocol: "", data: "" },
    };
  }
  return {
    kind,
    values: {
      code: `REQ-${String(existingRequirements + 1).padStart(3, "0")}`,
      text: "新建需求",
      priority: "MUST",
    },
  };
}

export function nextConnectionMode(
  current: boolean,
  action: "toggle" | "escape" | "connected" | "selectTool" | "viewChanged",
): boolean {
  if (action === "toggle") return !current;
  if (action === "connected") return current;
  return false;
}
