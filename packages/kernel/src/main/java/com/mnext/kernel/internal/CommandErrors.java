package com.mnext.kernel.internal;

import com.mnext.kernel.api.CommandError;
import java.util.List;
import java.util.Map;

final class CommandErrors {
  private CommandErrors() {}

  static KernelCommandException schema(String message) {
    return error("KERNEL-400-SCHEMA-INVALID", message, Map.of(), "按命令 Schema 修正载荷后重试");
  }

  static KernelCommandException typeNotFound() {
    return error("KERNEL-404-TYPE-NOT-FOUND", "对象类型不存在或不可用", Map.of(), "选择已发布的对象类型");
  }

  static KernelCommandException targetNotFound() {
    return error("KERNEL-404-TARGET-NOT-FOUND", "目标不存在或不可见", Map.of(), "刷新工作空间后重试");
  }

  static KernelCommandException workspaceNotFound() {
    return error("KERNEL-404-WORKSPACE-NOT-FOUND", "工作空间不存在或不可写", Map.of(), "确认工作空间状态");
  }

  static KernelCommandException archived() {
    return error("KERNEL-410-TARGET-ARCHIVED", "目标已废止", Map.of(), "恢复目标后再执行修改");
  }

  static KernelCommandException required(String fieldCode) {
    return error("RULE-422-REQUIRED", "必填字段缺失", Map.of("fieldDefCode", fieldCode), "填写必填字段后重试");
  }

  static KernelCommandException idempotency(String commandId) {
    return error(
        "KERNEL-409-IDEMPOTENCY-CONFLICT",
        "幂等键已用于不同载荷",
        Map.of("commandId", commandId),
        "生成新的幂等键后重试");
  }

  static KernelCommandException version(
      String targetId,
      long expectedVersion,
      long currentVersion,
      List<Map<String, Object>> conflictingFields) {
    return error(
        "KERNEL-409-VERSION-CONFLICT",
        "对象已被他人修改",
        Map.of(
            "targetType", "object",
            "targetId", targetId,
            "expectedVersion", expectedVersion,
            "currentVersion", currentVersion,
            "conflictingFields", conflictingFields),
        "拉取最新版本对比合并后重试;无重叠字段可直接以字段级版本重提");
  }

  private static KernelCommandException error(
      String code, String message, Map<String, Object> details, String suggestion) {
    return new KernelCommandException(new CommandError(code, message, details, suggestion));
  }
}
