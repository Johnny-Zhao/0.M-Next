package com.mnext.kernel.internal;

import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.RuleViolation;
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

  static CommandRejectedException stateTransition(String current, List<String> allowed) {
    return error(
        "KERNEL-409-STATE-TRANSITION-INVALID",
        "状态迁移不允许",
        Map.of("currentState", current, "allowedTransitions", allowed),
        "选择允许的目标状态后重试");
  }

  static CommandRejectedException activeRelations(List<String> relationIds, long total) {
    return error(
        "KERNEL-422-ACTIVE-RELATIONS",
        "目标存在活动关系",
        Map.of("relations", relationIds, "total", total, "relationPolicy", "unlink"),
        "确认影响后使用 relationPolicy=unlink");
  }

  static CommandRejectedException cascadeTooLarge(long total) {
    return error(
        "KERNEL-413-CASCADE-TOO-LARGE", "活动关系超过同步级联上限", Map.of("total", total), "先走预览并使用冷路径批量任务");
  }

  static CommandRejectedException nestedBatch() {
    return error("KERNEL-400-NESTED-BATCH", "BatchCommand 禁止嵌套", Map.of(), "移除嵌套批次后重试");
  }

  static CommandRejectedException batchTooLarge(long commands, long writes) {
    return error(
        "KERNEL-413-BATCH-TOO-LARGE",
        "批量命令超出热路径限额",
        Map.of("commands", commands, "estimatedWrites", writes),
        "先走预览并使用冷路径批量任务");
  }

  static CommandRejectedException templateVersionImmutable() {
    return error(
        "KERNEL-409-TEMPLATE-VERSION-IMMUTABLE", "已发布模板版本不可修改", Map.of(), "改在 draft 模板版本下操作");
  }

  static CommandRejectedException templateNotPublished() {
    return error("KERNEL-422-TEMPLATE-NOT-PUBLISHED", "模板版本尚未发布", Map.of(), "先发布模板版本后再实例化工作空间");
  }

  static CommandRejectedException templateEmpty() {
    return error("KERNEL-422-TEMPLATE-EMPTY", "模板版本为空", Map.of(), "至少定义一个对象类型后再发布");
  }

  static CommandRejectedException migrationRequired(List<Map<String, Object>> affected) {
    return error(
        "KERNEL-409-TEMPLATE-MIGRATION-REQUIRED",
        "模板演化包含收紧项, 需要人工迁移",
        Map.of("affected", affected),
        "先处理受影响存量数据后再应用模板版本");
  }

  static CommandRejectedException metaParentNotFound() {
    return error("META-422-PARENT-NOT-FOUND", "父类型不存在", Map.of(), "选择同工作空间内存在的父类型");
  }

  static CommandRejectedException metaParentCrossTemplate() {
    return error("META-422-PARENT-CROSS-TEMPLATE", "父子类型不在同一模板版本", Map.of(), "选择同模板版本的父类型");
  }

  static CommandRejectedException metaGeneralizationCycle() {
    return error("META-422-GENERALIZATION-CYCLE", "泛化链形成环", Map.of(), "调整父类型后重试");
  }

  static CommandRejectedException metaValueTypeBaseMismatch() {
    return error("META-422-VALUETYPE-BASE-MISMATCH", "子值类型根原语与父值类型不一致", Map.of(), "选择相同根原语的父值类型");
  }

  static CommandRejectedException metaRedefinitionInconsistent(List<String> violations) {
    return error(
        "META-422-REDEFINITION-INCONSISTENT",
        "重定义放宽了父级约束",
        Map.of("violations", violations),
        "仅允许更具体或更严格的重定义");
  }

  static CommandRejectedException metaPublishedImmutable() {
    return error("META-409-PUBLISHED-IMMUTABLE", "已发布元模型定义不可修改", Map.of(), "改在 draft 定义下操作");
  }

  static CommandRejectedException fieldConstraint(List<String> violations) {
    return error(
        "KERNEL-422-FIELD-CONSTRAINT-INVALID",
        "字段约束与类型不相容",
        Map.of("violations", violations),
        "修正字段约束后重试");
  }

  static CommandRejectedException fieldValue(List<Map<String, Object>> violations) {
    return error(
        "KERNEL-422-FIELD-VALUE-INVALID",
        "字段值不符合类型或约束",
        Map.of("violations", violations),
        "修正字段值后重试");
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

  static CommandRejectedException ruleViolation(List<RuleViolation> violations) {
    var details =
        violations.stream()
            .map(
                violation ->
                    Map.of(
                        "ruleCode",
                        violation.ruleCode(),
                        "severity",
                        violation.severity(),
                        "message",
                        violation.message()))
            .toList();
    return error(
        "RULE-422-RULE-VIOLATION", "命中阻断规则", Map.of("violations", details), "按规则提示修正字段后重试");
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

  static CommandRejectedException relationVersion(
      String targetId, long expectedVersion, long currentVersion) {
    return error(
        "KERNEL-409-VERSION-CONFLICT",
        "关系已被他人修改",
        Map.of(
            "targetType", "relation",
            "targetId", targetId,
            "expectedVersion", expectedVersion,
            "currentVersion", currentVersion,
            "conflictingFields", List.of()),
        "拉取最新关系版本后重试");
  }

  private static CommandRejectedException error(
      String code, String message, Map<String, Object> details, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, details, suggestion));
  }
}
