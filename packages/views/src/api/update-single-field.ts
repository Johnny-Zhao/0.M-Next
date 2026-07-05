import type { CommandClient, FieldUpdate } from "./command-client";
import { coerceFieldValue } from "./field-coerce";
import type { ViewObject } from "./view-client";

export type UpdateSingleFieldResult =
  | { readonly kind: "saved"; readonly value: unknown }
  | { readonly kind: "invalid"; readonly message: string };

export interface UpdateSingleFieldParams {
  readonly workspaceId: string;
  readonly object: ViewObject;
  readonly fieldCode: string;
  readonly raw: string;
  readonly dataType?: string;
  /** 乐观锁的期望对象版本;省略则用 object.version。冲突后重试可传后端回报的最新版本。 */
  readonly expectedObjectVersion?: number;
}

/**
 * 字段编辑的唯一出口:先按字段类型把编辑框字符串转成正确类型(数值→number,非法数字拦截并
 * 提示「请输入数字」、不提交),再经命令入口 updateFields 提交单字段。
 *
 * 新增任何字段编辑入口必须调用本函数,禁止直接调用 commandClient.updateFields——否则数值字段
 * 会以字符串提交、被内核 KERNEL-422-FIELD-VALUE-INVALID 拒绝(表格 / 文档 / 属性面板 / 命令面板
 * 等入口已全部收口至此)。乐观锁冲突(KERNEL-409)按 updateFields 原样抛出,由调用方决定重试或提示。
 *
 * 仅按对象版本乐观锁,一律不传 expectedFieldVersion:前端读模型不投影 per-field 版本
 * (ViewObject 只有对象级 version),而内核字段版本是与对象版本互不同步的独立计数器
 * (见 command-client FieldUpdate 注释 / UpdateFieldsHandler.conflicts)。若把 object.version
 * 当字段版本传入,会绕过对象级乐观锁并拿对象版本去比字段计数器,造成误判 409。故本出口
 * 只发 {fieldDefCode, value},由 expectedObjectVersion(默认 object.version)独占乐观锁。
 */
export async function updateSingleField(
  commandClient: Pick<CommandClient, "updateFields">,
  params: UpdateSingleFieldParams,
): Promise<UpdateSingleFieldResult> {
  const coerced = coerceFieldValue(
    params.raw,
    params.dataType,
    params.object.fields[params.fieldCode],
  );
  if (!coerced.ok) return { kind: "invalid", message: coerced.message };
  const update: FieldUpdate = {
    fieldDefCode: params.fieldCode,
    value: coerced.value,
  };
  await commandClient.updateFields(
    params.workspaceId,
    params.object.objectId,
    params.expectedObjectVersion ?? params.object.version,
    [update],
  );
  return { kind: "saved", value: coerced.value };
}
