export type FieldValueCoercion =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

/**
 * 保存前按字段类型转换编辑框里的字符串值。优先用字段定义的 dataType(number→数字、
 * boolean→布尔);拿不到定义(dataType 缺省)时按当前值的运行时类型兜底判断。数值转换
 * 得到非有限数(NaN / Infinity,如空白或字母)则阻止提交并提示「请输入数字」。纯函数,便于测试。
 */
export function coerceFieldValue(
  raw: string,
  dataType: string | undefined,
  currentValue: unknown,
): FieldValueCoercion {
  const numeric =
    dataType === "number" ||
    (dataType === undefined && typeof currentValue === "number");
  if (numeric) {
    const value = Number(raw);
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, message: "请输入数字" };
  }
  const boolean =
    dataType === "boolean" ||
    (dataType === undefined && typeof currentValue === "boolean");
  if (boolean) return { ok: true, value: raw === "true" };
  return { ok: true, value: raw };
}
