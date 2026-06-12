package com.mnext.kernel.internal;

import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import java.util.List;
import java.util.Map;

final class CommandErrors {
  private CommandErrors() {}

  static CommandRejectedException schema(String message) {
    return error("KERNEL-400-SCHEMA-INVALID", message, Map.of(), "按命令 Schema 修正载荷后重试");
  }

  static CommandRejectedException typeNotFound() {
    return error("KERNEL-404-TYPE-NOT-FOUND", "对象类型不存在或不可用", Map.of(), "选择已发布的对象类型");
  }

  static CommandRejectedException targetNotFound() {
    return error("KERNEL-404-TARGET-NOT-FOUND", "目标不存在或不可见", Map.of(), "刷新工作空间后重试");
  }

  static CommandRejectedException workspaceNotFound() {
    return error("KERNEL-404-WORKSPACE-NOT-FOUND", "工作空间不存在或不可写", Map.of(), "确认工作空间状态");
  }

  static CommandRejectedException archived() {
    return error("KERNEL-410-TARGET-ARCHIVED", "目标已废止", Map.of(), "恢复目标后再执行修改");
  }

  static CommandRejectedException endpointInvalid() {
    return error("KERNEL-422-ENDPOINT-INVALID", "关系端点无效或不可见", Map.of(), "确认端点后重试");
  }

  static CommandRejectedException duplicateRelation(String relationId) {
    return error(
        "KERNEL-409-DUPLICATE-RELATION", "活动关系已存在", Map.of("relationId", relationId), "使用已存在关系");
  }

  static CommandRejectedException cardinality(String definition, long current) {
    return error(
        "KERNEL-422-CARDINALITY-VIOLATION",
        "关系基数超限",
        Map.of("cardinality", definition, "current", current),
        "解除冲突关系后重试");
  }

  static CommandRejectedException cycle(List<String> path) {
    return error("KERNEL-409-CYCLE-DETECTED", "层级关系将形成环", Map.of("path", path), "调整端点后重试");
  }

  static CommandRejectedException required(String fieldCode) {
    return error("RULE-422-REQUIRED", "必填字段缺失", Map.of("fieldDefCode", fieldCode), "填写必填字段后重试");
  }

  static CommandRejectedException idempotency(String commandId) {
    return error(
        "KERNEL-409-IDEMPOTENCY-CONFLICT",
        "幂等键已用于不同载荷",
        Map.of("commandId", commandId),
        "生成新的幂等键后重试");
  }

  static CommandRejectedException version(
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

  private static CommandRejectedException error(
      String code, String message, Map<String, Object> details, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, details, suggestion));
  }
}
