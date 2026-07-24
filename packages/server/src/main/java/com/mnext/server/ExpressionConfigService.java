package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ExpressionConfigService {
  private static final int MAX_CONFIG_BYTES = 64 * 1024;
  private static final Set<String> KINDS = Set.of("grid", "canvas", "doc", "matrix", "bi", "ana");
  private final ExpressionConfigRepository repository;

  ExpressionConfigService(ExpressionConfigRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  List<ExpressionConfig> list(UUID workspaceId) {
    requireWorkspace(workspaceId);
    return repository.list(workspaceId);
  }

  @Transactional
  ExpressionConfig create(UUID workspaceId, String actor, ExpressionConfigCreateRequest request) {
    return createWithIds(
        workspaceId,
        actor,
        request,
        "user-exp-" + UUID.randomUUID(),
        "user-view-" + UUID.randomUUID());
  }

  @Transactional
  public ExpressionConfig createWithIds(
      UUID workspaceId,
      String actor,
      ExpressionConfigCreateRequest request,
      String expressionId,
      String viewId) {
    requireWorkspace(workspaceId);
    var normalized = validate(actor, request);
    if (repository.nameExists(workspaceId, normalized.name())) {
      throw rejected("KERNEL-409-DUPLICATE-VALUE", "当前工作空间已存在同名表达", "请更换表达名称后重试");
    }
    var now = Instant.now();
    try {
      repository.insertExpression(
          workspaceId,
          expressionId,
          normalized.name(),
          normalized.space(),
          viewId,
          normalized.defaultForm(),
          actor.trim(),
          now);
      repository.insertView(
          workspaceId,
          viewId,
          expressionId,
          normalized.view().kind(),
          normalized.view().config().toString(),
          actor.trim(),
          now);
    } catch (DataIntegrityViolationException failure) {
      throw rejected("KERNEL-409-DUPLICATE-VALUE", "表达名称或标识已存在", "请更换表达名称后重试");
    }
    return repository.list(workspaceId).stream()
        .filter(item -> item.expressionId().equals(expressionId))
        .findFirst()
        .orElseThrow();
  }

  private ExpressionConfigCreateRequest validate(
      String actor, ExpressionConfigCreateRequest request) {
    if (actor == null || actor.isBlank()) invalid("缺少操作者身份");
    if (request == null || request.name() == null || request.name().trim().isEmpty()) {
      invalid("表达名称不能为空");
    }
    var name = request.name().trim();
    if (name.length() > 256) invalid("表达名称不能超过 256 个字符");
    if (!Set.of("main", "workshop").contains(request.space())) {
      invalid("表达空间只能为 main 或 workshop");
    }
    if (request.view() == null || !KINDS.contains(request.view().kind())) {
      invalid("首个 View kind 不受支持");
    }
    if (!request.view().kind().equals(request.defaultForm())) {
      invalid("defaultForm 必须与首个 View kind 一致");
    }
    validateConfig(request.view().kind(), request.view().config());
    return new ExpressionConfigCreateRequest(
        name, request.space(), request.defaultForm(), request.view());
  }

  private void validateConfig(String kind, JsonNode config) {
    if (config == null || !config.isObject()) invalid("View config 必须是 JSON 对象");
    if (config.toString().getBytes(StandardCharsets.UTF_8).length > MAX_CONFIG_BYTES) {
      invalid("View config 不能超过 64 KiB");
    }
    var valid =
        switch (kind) {
          case "grid" -> text(config, "objectTypeCode") && array(config, "columns");
          case "canvas" -> text(config, "selectionObjectTypeCode") && array(config, "nodes");
          case "doc" -> text(config, "rootObjectTypeCode") && array(config, "fields");
          case "matrix" ->
              text(config, "sourceTypeCode")
                  && text(config, "rowField")
                  && text(config, "colField");
          case "bi" -> array(config, "metrics");
          case "ana" -> array(config, "comparisonFields");
          default -> false;
        };
    if (!valid) invalid("View config 缺少当前 kind 所需的顶层结构");
  }

  private void requireWorkspace(UUID workspaceId) {
    if (!repository.workspaceExists(workspaceId)) {
      throw rejected("KERNEL-404-WORKSPACE-NOT-FOUND", "工作空间不存在", "请确认工作空间后重试");
    }
  }

  private static boolean text(JsonNode node, String field) {
    return node.path(field).isTextual() && !node.path(field).asText().isBlank();
  }

  private static boolean array(JsonNode node, String field) {
    return node.path(field).isArray();
  }

  private static void invalid(String message) {
    throw rejected("KERNEL-400-SCHEMA-INVALID", message, "请修正表达配置后重试");
  }

  private static CommandRejectedException rejected(String code, String message, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, Map.of(), suggestion));
  }
}
