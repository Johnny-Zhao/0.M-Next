package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.rules.RuleParser;
import com.mnext.engines.rules.RuleSyntaxException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class RuleDefRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  RuleDefRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Transactional
  CommandResult defineRule(DefineRuleRequest request, String actor) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    var payloadHash = hash(json(request));
    var replay = replay(request.workspaceId(), request.idempotencyKey(), payloadHash);
    if (replay != null) return replay.replayed();
    validateWhen(request.when());
    validateSeverity(request.severity());
    var scope = resolveScope(request.workspaceId(), request.templateVersionId(), request.scope());
    var existing = existing(request.workspaceId(), request.ruleCode());
    if (existing != null && existing.published()) {
      throw rule("RULE-409-PUBLISHED-IMMUTABLE", "已发布规则不可覆盖", "复制为新的 ruleCode 或等待新版本规则流程");
    }
    var ruleId = existing == null ? UUID.randomUUID() : existing.id();
    var now = Instant.now();
    if (existing == null) {
      insertRule(ruleId, request, scope, actor, now);
    } else {
      updateRule(ruleId, request, scope, actor, now);
    }
    var result = accepted(commandId(), false);
    remember(
        request.workspaceId(),
        request.idempotencyKey(),
        result.commandId(),
        "DefineRule",
        payloadHash,
        result);
    return result;
  }

  @Transactional
  CommandResult publishRule(PublishRuleRequest request, String actor) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    var payloadHash = hash(json(request));
    var replay = replay(request.workspaceId(), request.idempotencyKey(), payloadHash);
    if (replay != null) return replay.replayed();
    var existing = existing(request.workspaceId(), request.ruleCode());
    if (existing == null) {
      throw rule("RULE-422-SCOPE-UNRESOLVED", "规则不存在", "先 DefineRule 创建草稿后再发布");
    }
    if (!existing.published()) {
      jdbc.update(
          """
          UPDATE rule_def
          SET published = TRUE, version = version + 1, updated_by = ?, updated_at = ?
          WHERE id = ?
          """,
          actor,
          Timestamp.from(Instant.now()),
          existing.id());
    }
    var result = accepted(commandId(), false);
    remember(
        request.workspaceId(),
        request.idempotencyKey(),
        result.commandId(),
        "PublishRule",
        payloadHash,
        result);
    return result;
  }

  private void insertRule(
      UUID ruleId, DefineRuleRequest request, ScopeIds scope, String actor, Instant now) {
    jdbc.update(
        """
        INSERT INTO rule_def
          (id, workspace_id, template_version_id, rule_code, scope_object_type_id,
           scope_field_def_id, severity, when_src, message, impact, suggest, fix,
           lightweight, published, version, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, CAST(? AS jsonb),
                ?, FALSE, 1, ?, ?, ?, ?)
        """,
        ruleId,
        request.workspaceId(),
        request.templateVersionId(),
        request.ruleCode(),
        scope.objectTypeId(),
        scope.fieldDefId(),
        request.severity(),
        request.when(),
        request.message(),
        jsonOrNull(request.impact()),
        request.suggest(),
        jsonOrNull(request.fix()),
        request.lightweight(),
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
  }

  private void updateRule(
      UUID ruleId, DefineRuleRequest request, ScopeIds scope, String actor, Instant now) {
    jdbc.update(
        """
        UPDATE rule_def
        SET template_version_id = ?, scope_object_type_id = ?, scope_field_def_id = ?,
            severity = ?, when_src = ?, message = ?, impact = CAST(? AS jsonb),
            suggest = ?, fix = CAST(? AS jsonb), lightweight = ?, version = version + 1,
            updated_by = ?, updated_at = ?
        WHERE id = ? AND published = FALSE
        """,
        request.templateVersionId(),
        scope.objectTypeId(),
        scope.fieldDefId(),
        request.severity(),
        request.when(),
        request.message(),
        jsonOrNull(request.impact()),
        request.suggest(),
        jsonOrNull(request.fix()),
        request.lightweight(),
        actor,
        Timestamp.from(now),
        ruleId);
  }

  private ScopeIds resolveScope(UUID workspaceId, UUID templateVersionId, RuleScopeRequest scope) {
    if (scope == null || blank(scope.objectTypeCode())) {
      throw rule("RULE-422-SCOPE-UNRESOLVED", "规则 scope 类型不存在", "确认 objectTypeCode 已发布且属于当前工作空间");
    }
    var typeId =
        templateVersionId == null
            ? publishedObjectType(workspaceId, scope.objectTypeCode())
            : templateObjectType(workspaceId, templateVersionId, scope.objectTypeCode());
    if (typeId.isEmpty()) {
      throw rule("RULE-422-SCOPE-UNRESOLVED", "规则 scope 类型不存在", "确认 objectTypeCode 已发布且属于当前工作空间");
    }
    if (blank(scope.fieldCode())) {
      return new ScopeIds(typeId.getFirst(), null);
    }
    return new ScopeIds(typeId.getFirst(), resolveField(typeId.getFirst(), scope.fieldCode()));
  }

  private List<UUID> publishedObjectType(UUID workspaceId, String code) {
    return jdbc.query(
        """
        SELECT id FROM object_type
        WHERE workspace_id = ? AND code = ? AND published = TRUE
        """,
        (row, index) -> row.getObject(1, UUID.class),
        workspaceId,
        code);
  }

  private List<UUID> templateObjectType(UUID workspaceId, UUID templateVersionId, String code) {
    return jdbc.query(
        """
        SELECT id FROM object_type
        WHERE workspace_id = ? AND template_version_id = ? AND code = ?
        """,
        (row, index) -> row.getObject(1, UUID.class),
        workspaceId,
        templateVersionId,
        code);
  }

  private UUID resolveField(UUID objectTypeId, String fieldCode) {
    var fieldIds =
        jdbc.query(
            """
            WITH RECURSIVE type_chain(id, parent_type_id, depth) AS (
              SELECT id, parent_type_id, 0 FROM object_type WHERE id = ?
              UNION ALL
              SELECT parent.id, parent.parent_type_id, child.depth + 1
              FROM object_type parent
              JOIN type_chain child ON parent.id = child.parent_type_id
              WHERE child.depth < 16
            )
            SELECT field.id
            FROM field_def field
            JOIN type_chain type ON type.id = field.object_type_id
            WHERE field.code = ?
            ORDER BY type.depth
            LIMIT 1
            """,
            (row, index) -> row.getObject(1, UUID.class),
            objectTypeId,
            fieldCode);
    if (fieldIds.isEmpty()) {
      throw rule("RULE-422-SCOPE-UNRESOLVED", "规则 scope 字段不存在", "确认 fieldCode 属于该对象类型的有效字段");
    }
    return fieldIds.getFirst();
  }

  private ExistingRule existing(UUID workspaceId, String ruleCode) {
    var values =
        jdbc.query(
            "SELECT id, published FROM rule_def WHERE workspace_id = ? AND rule_code = ?",
            (row, index) -> new ExistingRule(row.getObject(1, UUID.class), row.getBoolean(2)),
            workspaceId,
            ruleCode);
    return values.isEmpty() ? null : values.getFirst();
  }

  private void validateWhen(String when) {
    try {
      RuleParser.parse(when);
    } catch (RuleSyntaxException failure) {
      throw rule("RULE-400-DSL-SYNTAX-INVALID", "规则 when 表达式语法无效", "修正 DSL 表达式后重试");
    }
  }

  private void validateSeverity(String severity) {
    if (!List.of("BLOCK", "WARN", "INFO").contains(severity)) {
      throw rule("RULE-400-SCHEMA-INVALID", "规则 severity 无效", "severity 只能为 BLOCK、WARN 或 INFO");
    }
  }

  private CommandResult replay(UUID workspaceId, String idempotencyKey, String payloadHash) {
    var stored =
        jdbc.query(
            """
            SELECT command_id, payload_hash
            FROM command_log WHERE workspace_id = ? AND idempotency_key = ?
            """,
            (row, index) -> new StoredCommand(row.getString(1), row.getString(2)),
            workspaceId,
            idempotencyKey);
    if (stored.isEmpty()) {
      return null;
    }
    var command = stored.getFirst();
    if (!command.payloadHash().equals(payloadHash)) {
      throw rule("RULE-409-IDEMPOTENCY-CONFLICT", "幂等键已被不同载荷使用", "更换 idempotencyKey 后重试");
    }
    return accepted(command.commandId(), true);
  }

  private void remember(
      UUID workspaceId,
      String idempotencyKey,
      String commandId,
      String commandType,
      String payloadHash,
      CommandResult result) {
    jdbc.update(
        """
        INSERT INTO command_log
          (workspace_id, idempotency_key, command_id, command_type, payload_hash,
           result_snapshot, decided_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        """,
        workspaceId,
        idempotencyKey,
        commandId,
        commandType,
        payloadHash,
        json(result),
        Timestamp.from(Instant.now()));
  }

  private void validateEnvelope(UUID workspaceId, String idempotencyKey) {
    if (workspaceId == null) {
      throw rule("RULE-400-SCHEMA-INVALID", "workspaceId 必填", "按规则命令 Schema 修正载荷后重试");
    }
    if (blank(idempotencyKey) || idempotencyKey.length() > 128) {
      throw rule("RULE-400-SCHEMA-INVALID", "idempotencyKey 长度必须为 1..128", "按规则命令 Schema 修正载荷后重试");
    }
  }

  private String jsonOrNull(JsonNode value) {
    return value == null ? null : json(value);
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("规则命令 JSON 无法序列化", failure);
    }
  }

  private static CommandResult accepted(String commandId, boolean replay) {
    return new CommandResult(commandId, CommandStatus.ACCEPTED, replay, List.of(), null);
  }

  private static String hash(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }

  private static String commandId() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 26);
  }

  private static boolean blank(String value) {
    return value == null || value.isBlank();
  }

  private static RuleCommandException rule(String code, String message, String suggestion) {
    return new RuleCommandException(code, message, suggestion);
  }

  private record ScopeIds(UUID objectTypeId, UUID fieldDefId) {}

  private record ExistingRule(UUID id, boolean published) {}

  private record StoredCommand(String commandId, String payloadHash) {}
}
