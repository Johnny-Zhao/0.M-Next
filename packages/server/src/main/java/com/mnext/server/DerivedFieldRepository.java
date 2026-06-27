package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.rules.Aggregate;
import com.mnext.engines.rules.Arithmetic;
import com.mnext.engines.rules.Comparison;
import com.mnext.engines.rules.Conditional;
import com.mnext.engines.rules.FieldRef;
import com.mnext.engines.rules.FunctionCall;
import com.mnext.engines.rules.Logical;
import com.mnext.engines.rules.Not;
import com.mnext.engines.rules.RuleExpression;
import com.mnext.engines.rules.RuleParser;
import com.mnext.engines.rules.RuleSyntaxException;
import com.mnext.engines.rules.TraverseDeep;
import com.mnext.engines.rules.TraverseFrom;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import com.mnext.kernel.api.metamodel.DataType;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class DerivedFieldRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  DerivedFieldRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  List<String> codesForObjectType(UUID workspaceId, String objectTypeCode) {
    if (workspaceId == null || blank(objectTypeCode)) return List.of();
    return jdbc.query(
        """
        WITH RECURSIVE type_chain(id, parent_type_id, depth) AS (
          SELECT id, parent_type_id, 0
          FROM object_type
          WHERE workspace_id = ? AND code = ?
          UNION ALL
          SELECT parent.id, parent.parent_type_id, child.depth + 1
          FROM object_type parent
          JOIN type_chain child ON parent.id = child.parent_type_id
          WHERE parent.workspace_id = ? AND child.depth < 32
        )
        SELECT DISTINCT ON (derived.code) derived.code
        FROM derived_field derived
        JOIN type_chain type ON type.id = derived.object_type_id
        WHERE derived.workspace_id = ?
        ORDER BY derived.code, type.depth ASC
        """,
        (row, ignored) -> row.getString(1),
        workspaceId,
        objectTypeCode,
        workspaceId,
        workspaceId);
  }

  @Transactional
  CommandResult define(DefineDerivedFieldRequest request, String actor) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    validatePayload(request);
    var payloadHash = hash(json(request));
    var replay = replay(request.workspaceId(), request.idempotencyKey(), payloadHash);
    if (replay != null) return replay.replayed();
    var expression = parse(request.derivation());
    var typeChain = typeChain(request.workspaceId(), request.objectTypeId());
    validateTemplate(request);
    rejectStoredFieldConflict(request.code(), typeChain);
    rejectDerivedFieldConflict(request.code(), typeChain);
    var derivedFields = effectiveDerivedFields(typeChain);
    var references = fieldReferences(expression);
    derivedFields.put(request.code(), references);
    rejectCycles(derivedFields);
    insert(request, actor);
    var result = accepted(commandId(), false);
    remember(
        request.workspaceId(),
        request.idempotencyKey(),
        result.commandId(),
        "DefineDerivedField",
        payloadHash,
        result);
    return result;
  }

  private void insert(DefineDerivedFieldRequest request, String actor) {
    var now = Timestamp.from(Instant.now());
    jdbc.update(
        """
        INSERT INTO derived_field
          (id, workspace_id, object_type_id, template_version_id, code, name, result_type,
           derivation, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        UUID.randomUUID(),
        request.workspaceId(),
        request.objectTypeId(),
        request.templateVersionId(),
        request.code(),
        request.name(),
        request.resultType(),
        request.derivation(),
        actor,
        actor,
        now,
        now);
  }

  private RuleExpression parse(String derivation) {
    try {
      return RuleParser.parse(derivation);
    } catch (RuleSyntaxException failure) {
      throw error(
          "DERIVE-400-SYNTAX-INVALID",
          "派生表达式语法无效",
          Map.of("reason", failure.getMessage()),
          "修正 derivation 表达式后重试");
    }
  }

  private void validatePayload(DefineDerivedFieldRequest request) {
    if (request.workspaceId() == null
        || request.objectTypeId() == null
        || blank(request.code())
        || blank(request.name())
        || blank(request.resultType())
        || blank(request.derivation())) {
      throw error(
          "KERNEL-400-SCHEMA-INVALID", "派生字段载荷不完整", Map.of(), "按 DefineDerivedField Schema 修正后重试");
    }
    if (!request.code().matches("[a-z][a-z0-9_]{0,127}")) {
      throw error(
          "KERNEL-422-FIELD-CONSTRAINT-INVALID",
          "派生字段 code 不符合命名约束",
          Map.of("code", request.code()),
          "使用小写字母开头的 snake_case code");
    }
    try {
      DataType.fromCode(request.resultType());
    } catch (IllegalArgumentException failure) {
      throw error(
          "KERNEL-400-SCHEMA-INVALID",
          "派生字段 resultType 无效",
          Map.of("resultType", request.resultType()),
          "使用已登记 dataType");
    }
  }

  private void validateTemplate(DefineDerivedFieldRequest request) {
    if (request.templateVersionId() == null) return;
    var status =
        jdbc.query(
            """
            SELECT status FROM scene_template_version
            WHERE id = ?
            """,
            result -> result.next() ? result.getString(1) : null,
            request.templateVersionId());
    if (status == null) {
      throw error("KERNEL-400-SCHEMA-INVALID", "templateVersionId 不存在", Map.of(), "确认模板版本后重试");
    }
    if ("published".equals(status)) {
      throw error(
          "KERNEL-409-TEMPLATE-VERSION-IMMUTABLE",
          "已发布模板版本不可修改",
          Map.of("templateVersionId", request.templateVersionId()),
          "基于新草稿版本定义派生字段");
    }
    var matches =
        Boolean.TRUE.equals(
            jdbc.queryForObject(
                """
                SELECT EXISTS(SELECT 1 FROM object_type
                  WHERE workspace_id = ? AND id = ? AND template_version_id = ?)
                """,
                Boolean.class,
                request.workspaceId(),
                request.objectTypeId(),
                request.templateVersionId()));
    if (!matches) {
      throw error(
          "KERNEL-400-SCHEMA-INVALID",
          "objectTypeId 不属于该模板版本",
          Map.of(),
          "确认 objectTypeId 与 templateVersionId 后重试");
    }
  }

  private List<UUID> typeChain(UUID workspaceId, UUID objectTypeId) {
    var chain =
        jdbc.query(
            """
            WITH RECURSIVE type_chain(id, parent_type_id, depth) AS (
              SELECT id, parent_type_id, 0
              FROM object_type
              WHERE workspace_id = ? AND id = ?
              UNION ALL
              SELECT parent.id, parent.parent_type_id, child.depth + 1
              FROM object_type parent
              JOIN type_chain child ON parent.id = child.parent_type_id
              WHERE child.depth < 32
            )
            SELECT id FROM type_chain ORDER BY depth
            """,
            (row, index) -> row.getObject(1, UUID.class),
            workspaceId,
            objectTypeId);
    if (chain.isEmpty()) {
      throw error("KERNEL-404-TYPE-NOT-FOUND", "对象类型不存在", Map.of(), "确认 objectTypeId 后重试");
    }
    return chain;
  }

  private void rejectStoredFieldConflict(String code, List<UUID> typeChain) {
    var exists =
        Boolean.TRUE.equals(
            jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM field_def WHERE object_type_id IN ("
                    + placeholders(typeChain.size())
                    + ") AND code = ?)",
                Boolean.class,
                args(typeChain, code)));
    if (exists) {
      throw codeConflict(code);
    }
  }

  private void rejectDerivedFieldConflict(String code, List<UUID> typeChain) {
    var exists =
        Boolean.TRUE.equals(
            jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM derived_field WHERE object_type_id IN ("
                    + placeholders(typeChain.size())
                    + ") AND code = ?)",
                Boolean.class,
                args(typeChain, code)));
    if (exists) {
      throw codeConflict(code);
    }
  }

  private LinkedHashMap<String, Set<String>> effectiveDerivedFields(List<UUID> typeChain) {
    var fields =
        jdbc.query(
            "SELECT code, derivation FROM derived_field WHERE object_type_id IN ("
                + placeholders(typeChain.size())
                + ") ORDER BY created_at, code",
            (row, index) -> new ExistingDerivedField(row.getString(1), row.getString(2)),
            typeChain.toArray());
    var result = new LinkedHashMap<String, Set<String>>();
    for (var field : fields) {
      result.put(field.code(), fieldReferences(parse(field.derivation())));
    }
    return result;
  }

  private Set<String> fieldReferences(RuleExpression expression) {
    var references = new HashSet<String>();
    collectFieldReferences(expression, references);
    return references;
  }

  private void collectFieldReferences(RuleExpression expression, Set<String> references) {
    if (expression instanceof FieldRef fieldRef) {
      references.add(fieldRef.code());
    } else if (expression instanceof Comparison comparison) {
      collectFieldReferences(comparison.left(), references);
      collectFieldReferences(comparison.right(), references);
    } else if (expression instanceof Logical logical) {
      collectFieldReferences(logical.left(), references);
      collectFieldReferences(logical.right(), references);
    } else if (expression instanceof Not not) {
      collectFieldReferences(not.expression(), references);
    } else if (expression instanceof FunctionCall functionCall) {
      functionCall.arguments().forEach(argument -> collectFieldReferences(argument, references));
    } else if (expression instanceof TraverseFrom traverseFrom) {
      collectFieldReferences(traverseFrom.source(), references);
    } else if (expression instanceof TraverseDeep traverseDeep) {
      collectFieldReferences(traverseDeep.maxDepth(), references);
    } else if (expression instanceof Aggregate aggregate) {
      collectFieldReferences(aggregate.source(), references);
      if (aggregate.predicate() != null) collectFieldReferences(aggregate.predicate(), references);
    } else if (expression instanceof Arithmetic arithmetic) {
      collectFieldReferences(arithmetic.left(), references);
      collectFieldReferences(arithmetic.right(), references);
    } else if (expression instanceof Conditional conditional) {
      collectFieldReferences(conditional.condition(), references);
      collectFieldReferences(conditional.ifTrue(), references);
      collectFieldReferences(conditional.ifFalse(), references);
    }
  }

  private void rejectCycles(Map<String, Set<String>> graph) {
    var visiting = new HashSet<String>();
    var visited = new HashSet<String>();
    var stack = new ArrayDeque<String>();
    for (var node : graph.keySet()) {
      if (!visited.contains(node)) {
        visit(node, graph, visiting, visited, stack);
      }
    }
  }

  private void visit(
      String node,
      Map<String, Set<String>> graph,
      Set<String> visiting,
      Set<String> visited,
      ArrayDeque<String> stack) {
    if (visiting.contains(node)) {
      throw cycle(node, stack);
    }
    if (visited.contains(node)) {
      return;
    }
    visiting.add(node);
    stack.addLast(node);
    for (var dependency : graph.getOrDefault(node, Set.of())) {
      if (graph.containsKey(dependency)) {
        visit(dependency, graph, visiting, visited, stack);
      }
    }
    stack.removeLast();
    visiting.remove(node);
    visited.add(node);
  }

  private CommandRejectedException cycle(String repeated, ArrayDeque<String> stack) {
    var path = new ArrayList<String>();
    var include = false;
    for (var value : stack) {
      if (value.equals(repeated)) {
        include = true;
      }
      if (include) {
        path.add(value);
      }
    }
    path.add(repeated);
    throw error(
        "DERIVE-409-DEPENDENCY-CYCLE", "派生字段依赖成环", Map.of("cycle", path), "调整 derivation，移除循环引用");
  }

  private CommandRejectedException codeConflict(String code) {
    return error(
        "KERNEL-422-FIELD-CONSTRAINT-INVALID",
        "派生字段 code 与已有字段冲突",
        Map.of("code", code),
        "更换派生字段 code");
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
    if (workspaceId == null) {
      throw error("KERNEL-400-SCHEMA-INVALID", "workspaceId 必填", Map.of(), "按命令 Schema 修正后重试");
    }
    if (blank(idempotencyKey) || idempotencyKey.length() > 128) {
      throw error(
          "KERNEL-400-SCHEMA-INVALID", "idempotencyKey 长度必须为 1..128", Map.of(), "按命令 Schema 修正后重试");
    }
  }

  private String placeholders(int count) {
    return String.join(", ", java.util.Collections.nCopies(count, "?"));
  }

  private Object[] args(List<UUID> values, Object extra) {
    var args = new ArrayList<Object>(values);
    args.add(extra);
    return args.toArray();
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("派生命令 JSON 无法序列化", failure);
    }
  }

  private static CommandResult accepted(String commandId, boolean replay) {
    return new CommandResult(commandId, CommandStatus.ACCEPTED, replay, List.of(), null);
  }

  private static CommandRejectedException error(
      String code, String message, Map<String, Object> details, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, details, suggestion));
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

  private record ExistingDerivedField(String code, String derivation) {}

  private record StoredCommand(String commandId, String payloadHash) {}
}
