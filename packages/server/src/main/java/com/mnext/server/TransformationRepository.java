package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.rules.RuleParser;
import com.mnext.engines.rules.RuleSyntaxException;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class TransformationRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  TransformationRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Transactional
  CommandResult define(DefineTransformationRequest request, String actor) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    validatePayload(request);
    var payloadHash = hash(json(request));
    var replay = replay(request.workspaceId(), request.idempotencyKey(), payloadHash);
    if (replay != null) return replay.replayed();
    validateMappings(request);
    insert(request, actor);
    var result = accepted(commandId(), false);
    remember(
        request.workspaceId(),
        request.idempotencyKey(),
        result.commandId(),
        "DefineTransformation",
        payloadHash,
        result);
    return result;
  }

  TransformationDefinition find(UUID workspaceId, String code) {
    var definitions =
        jdbc.query(
            """
            SELECT code, correspondence_relation_code, object_mappings::text,
                   relation_mappings::text
            FROM m2m_transformation
            WHERE workspace_id = ? AND code = ?
            """,
            (row, index) ->
                new TransformationDefinition(
                    row.getString(1),
                    row.getString(2),
                    objectMappings(row.getString(3)),
                    relationMappings(row.getString(4))),
            workspaceId,
            code);
    if (definitions.isEmpty()) {
      throw error(
          "M2M-422-SOURCE-UNRESOLVED",
          "转换定义不存在",
          Map.of("transformationCode", code),
          "确认 transformationCode 后重试");
    }
    return definitions.getFirst();
  }

  private void insert(DefineTransformationRequest request, String actor) {
    var now = Timestamp.from(Instant.now());
    jdbc.update(
        """
        INSERT INTO m2m_transformation
          (id, workspace_id, template_version_id, code, name, correspondence_relation_code,
           object_mappings, relation_mappings, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), ?, ?, ?, ?)
        """,
        UUID.randomUUID(),
        request.workspaceId(),
        request.templateVersionId(),
        request.code(),
        request.name(),
        request.correspondenceRelationCode(),
        json(request.objectMappings()),
        json(request.relationMappings() == null ? List.of() : request.relationMappings()),
        actor,
        actor,
        now,
        now);
  }

  private void validatePayload(DefineTransformationRequest request) {
    if (request.workspaceId() == null
        || blank(request.code())
        || blank(request.name())
        || blank(request.correspondenceRelationCode())
        || request.objectMappings() == null
        || request.objectMappings().isEmpty()) {
      throw invalid("转换定义载荷不完整", Map.of());
    }
    for (var mapping : request.objectMappings()) {
      if (mapping == null
          || blank(mapping.sourceTypeCode())
          || blank(mapping.targetTypeCode())
          || mapping.fieldMappings() == null) {
        throw invalid("对象映射载荷不完整", Map.of());
      }
      for (var field : mapping.fieldMappings()) {
        if (field == null || blank(field.targetFieldCode()) || blank(field.expression())) {
          throw invalid("字段映射载荷不完整", Map.of());
        }
        parse(field.expression());
      }
    }
    if (request.relationMappings() == null) return;
    for (var mapping : request.relationMappings()) {
      if (mapping == null
          || blank(mapping.sourceRelationCode())
          || blank(mapping.targetRelationCode())) {
        throw invalid("关系映射载荷不完整", Map.of());
      }
    }
  }

  private void validateMappings(DefineTransformationRequest request) {
    requireRelation(request.workspaceId(), request.correspondenceRelationCode(), "correspondence");
    for (var mapping : request.objectMappings()) {
      requireObjectType(request.workspaceId(), mapping.sourceTypeCode(), "sourceTypeCode");
      requireObjectType(request.workspaceId(), mapping.targetTypeCode(), "targetTypeCode");
    }
    if (request.relationMappings() == null) return;
    for (var mapping : request.relationMappings()) {
      requireRelation(request.workspaceId(), mapping.sourceRelationCode(), "sourceRelationCode");
      requireRelation(request.workspaceId(), mapping.targetRelationCode(), "targetRelationCode");
    }
  }

  private void requireObjectType(UUID workspaceId, String code, String field) {
    if (!exists("object_type", workspaceId, code)) {
      throw invalid("对象类型不存在", Map.of(field, code));
    }
  }

  private void requireRelation(UUID workspaceId, String code, String field) {
    if (!exists("relation_type", workspaceId, code)) {
      throw invalid("关系类型不存在", Map.of(field, code));
    }
  }

  private boolean exists(String table, UUID workspaceId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM " + table + " WHERE workspace_id = ? AND code = ?)",
            Boolean.class,
            workspaceId,
            code));
  }

  private void parse(String expression) {
    try {
      RuleParser.parse(expression);
    } catch (RuleSyntaxException failure) {
      throw invalid("映射表达式语法无效", Map.of("reason", failure.getMessage()));
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
    if (stored.isEmpty()) return null;
    var command = stored.getFirst();
    if (!command.payloadHash().equals(payloadHash)) {
      throw error(
          "KERNEL-409-IDEMPOTENCY-CONFLICT", "幂等键已被不同载荷使用", Map.of(), "更换 idempotencyKey 后重试");
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
    if (workspaceId == null || blank(idempotencyKey) || idempotencyKey.length() > 128) {
      throw invalid("转换命令信封不完整", Map.of());
    }
  }

  private List<ObjectMapping> objectMappings(String value) {
    try {
      return mapper.readValue(
          value, mapper.getTypeFactory().constructCollectionType(List.class, ObjectMapping.class));
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("对象映射 JSON 无法解析", failure);
    }
  }

  private List<RelationMapping> relationMappings(String value) {
    try {
      return mapper.readValue(
          value,
          mapper.getTypeFactory().constructCollectionType(List.class, RelationMapping.class));
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("关系映射 JSON 无法解析", failure);
    }
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("转换命令 JSON 无法序列化", failure);
    }
  }

  private CommandRejectedException invalid(String message, Map<String, Object> details) {
    return error("M2M-400-MAPPING-INVALID", message, details, "修正转换映射后重试");
  }

  static CommandRejectedException error(
      String code, String message, Map<String, Object> details, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, details, suggestion));
  }

  static CommandResult accepted(String commandId, boolean replay) {
    return new CommandResult(commandId, CommandStatus.ACCEPTED, replay, List.of(), null);
  }

  static String commandId() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 26);
  }

  private static String hash(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }

  private static boolean blank(String value) {
    return value == null || value.isBlank();
  }

  record TransformationDefinition(
      String code,
      String correspondenceRelationCode,
      List<ObjectMapping> objectMappings,
      List<RelationMapping> relationMappings) {}

  private record StoredCommand(String commandId, String payloadHash) {}
}
