package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.rules.EvalContext;
import com.mnext.engines.rules.RuleEvaluator;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class RuleCheckRunner {
  private static final int MAX_RELATION_PAGE = 200;
  private static final Pattern FIELD_PLACEHOLDER =
      Pattern.compile("\\$\\{field\\('([a-z][a-z0-9_]{0,127})'\\)\\}");
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final CheckResultRepository results;
  private final DerivedEvaluator derivedEvaluator;
  private final RuleEvaluator evaluator = new RuleEvaluator();

  RuleCheckRunner(
      JdbcTemplate jdbc,
      ObjectMapper mapper,
      CheckResultRepository results,
      DerivedEvaluator derivedEvaluator) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.results = results;
    this.derivedEvaluator = derivedEvaluator;
  }

  @Transactional
  CommandResult run(RunRuleCheckRequest request) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    var payloadHash = hash(json(request));
    var replay = replay(request.workspaceId(), request.idempotencyKey(), payloadHash);
    if (replay != null) return replay.replayed();
    var scopeTypeId = resolveScopeType(request.workspaceId(), request.scope());
    var rules = rulesForHash(request.workspaceId(), scopeTypeId);
    var configHash = hash(scopeKey(request.scope()) + "\n" + json(rules));
    var runId = UUID.randomUUID();
    var now = Instant.now();
    for (var object : objects(request.workspaceId(), scopeTypeId)) {
      var values = new LinkedHashMap<String, Object>(object.fields());
      values.put("$objectId", object.objectId());
      for (var rule : applicableRules(request.workspaceId(), object.objectTypeId())) {
        var expression = ExpressionLanguageSupport.parse(rule.whenSrc());
        var context = context(request.workspaceId(), object.objectTypeId(), values);
        if (evaluator.evaluate(expression, context)) {
          results.insert(
              request.workspaceId(),
              runId,
              rule.ruleCode(),
              rule.severity(),
              interpolate(rule.message(), context),
              object.objectId(),
              rule.fieldCode(),
              configHash,
              now);
        }
      }
    }
    results.completeRun(
        request.workspaceId(), runId, scopeObjectTypeCode(request.scope()), now);
    var result =
        new CommandResult(
            commandId(), CommandStatus.ACCEPTED, false, List.of(runId.toString()), null);
    remember(
        request.workspaceId(), request.idempotencyKey(), result.commandId(), payloadHash, result);
    return result;
  }

  private UUID resolveScopeType(UUID workspaceId, RuleScopeRequest scope) {
    if (scope == null || scope.objectTypeCode() == null || scope.objectTypeCode().isBlank()) {
      return null;
    }
    var types =
        jdbc.query(
            """
            SELECT id FROM object_type
            WHERE workspace_id = ? AND code = ? AND published = TRUE
            """,
            (row, ignored) -> row.getObject(1, UUID.class),
            workspaceId,
            scope.objectTypeCode());
    if (types.isEmpty()) {
      throw new RuleCommandException(
          "RULE-422-SCOPE-UNRESOLVED", "规则检查 scope 类型不存在", "确认 objectTypeCode 已发布且属于当前工作空间");
    }
    return types.getFirst();
  }

  private List<ObjectRow> objects(UUID workspaceId, UUID scopeTypeId) {
    if (scopeTypeId == null) {
      return jdbc.query(
          """
          SELECT object.object_id, type.id, object.fields::text
          FROM rm_object object
          JOIN object_type type
            ON type.workspace_id = object.workspace_id
           AND type.code = object.object_type_code
          WHERE object.workspace_id = ?
            AND object.status NOT IN ('VOID', 'FILED', 'DELETED')
          ORDER BY object.object_id
          LIMIT 1000
          """,
          (row, ignored) ->
              new ObjectRow(
                  row.getObject(1, UUID.class),
                  row.getObject(2, UUID.class),
                  map(row.getString(3))),
          workspaceId);
    }
    return jdbc.query(
        """
        WITH RECURSIVE descendants AS (
          SELECT id FROM object_type WHERE workspace_id = ? AND id = ?
          UNION ALL
          SELECT child.id
          FROM object_type child
          JOIN descendants parent ON child.parent_type_id = parent.id
          WHERE child.workspace_id = ?
        )
        SELECT object.object_id, type.id, object.fields::text
        FROM rm_object object
        JOIN object_type type
          ON type.workspace_id = object.workspace_id
         AND type.code = object.object_type_code
        WHERE object.workspace_id = ?
          AND object.status NOT IN ('VOID', 'FILED', 'DELETED')
          AND type.id IN (SELECT id FROM descendants)
        ORDER BY object.object_id
        LIMIT 1000
        """,
        (row, ignored) ->
            new ObjectRow(
                row.getObject(1, UUID.class), row.getObject(2, UUID.class), map(row.getString(3))),
        workspaceId,
        scopeTypeId,
        workspaceId,
        workspaceId);
  }

  private List<RuleRow> applicableRules(UUID workspaceId, UUID objectTypeId) {
    return jdbc.query(
        """
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_type_id FROM object_type
          WHERE workspace_id = ? AND id = ?
          UNION ALL
          SELECT parent.id, parent.parent_type_id
          FROM object_type parent
          JOIN ancestors child ON parent.id = child.parent_type_id
          WHERE parent.workspace_id = ?
        )
        SELECT rule.rule_code, rule.severity, rule.when_src, rule.message, field.code
        FROM rule_def rule
        LEFT JOIN field_def field ON field.id = rule.scope_field_def_id
        WHERE rule.workspace_id = ?
          AND rule.published = TRUE
          AND rule.scope_object_type_id IN (SELECT id FROM ancestors)
        ORDER BY rule.rule_code
        """,
        (row, ignored) ->
            new RuleRow(
                row.getString(1),
                row.getString(2),
                row.getString(3),
                row.getString(4),
                row.getString(5)),
        workspaceId,
        objectTypeId,
        workspaceId,
        workspaceId);
  }

  private List<RuleFingerprint> rulesForHash(UUID workspaceId, UUID scopeTypeId) {
    var scopeFilter =
        scopeTypeId == null
            ? ""
            : """
            AND rule.scope_object_type_id IN (
              WITH RECURSIVE ancestors AS (
                SELECT id, parent_type_id FROM object_type
                WHERE workspace_id = ? AND id = ?
                UNION ALL
                SELECT parent.id, parent.parent_type_id
                FROM object_type parent
                JOIN ancestors child ON parent.id = child.parent_type_id
                WHERE parent.workspace_id = ?),
              descendants AS (
                SELECT id FROM object_type WHERE workspace_id = ? AND id = ?
                UNION ALL
                SELECT child.id
                FROM object_type child
                JOIN descendants parent ON child.parent_type_id = parent.id
                WHERE child.workspace_id = ?)
              SELECT id FROM ancestors
              UNION
              SELECT id FROM descendants)
            """;
    var sql =
        """
        SELECT rule.rule_code, rule.severity, rule.when_src, rule.message,
               COALESCE(field.code, ''), rule.lightweight, rule.version
        FROM rule_def rule
        LEFT JOIN field_def field ON field.id = rule.scope_field_def_id
        WHERE rule.workspace_id = ?
          AND rule.published = TRUE
        """
            + scopeFilter
            + " ORDER BY rule.rule_code";
    var args = new ArrayList<Object>();
    args.add(workspaceId);
    if (scopeTypeId != null) {
      args.add(workspaceId);
      args.add(scopeTypeId);
      args.add(workspaceId);
      args.add(workspaceId);
      args.add(scopeTypeId);
      args.add(workspaceId);
    }
    return jdbc.query(
        sql,
        (row, ignored) ->
            new RuleFingerprint(
                row.getString(1),
                row.getString(2),
                row.getString(3),
                row.getString(4),
                row.getString(5),
                row.getBoolean(6),
                row.getLong(7)),
        args.toArray());
  }

  private EvalContext context(UUID workspaceId, UUID objectTypeId, Map<String, Object> values) {
    var objectId = values.get("$objectId");
    return new EvalContext() {
      @Override
      public Object fieldValue(String code) {
        if (values.containsKey(code)) {
          return values.get(code);
        }
        return derivedEvaluator.evaluate(
            workspaceId,
            objectId instanceof UUID currentObjectId ? currentObjectId : null,
            objectTypeId,
            values,
            code);
      }

      @Override
      public int relationCount(String type) {
        if (!(objectId instanceof UUID currentObjectId)) return 0;
        return directRelationCount(workspaceId, currentObjectId, type);
      }

      @Override
      public boolean hasRelation(String type) {
        return relationCount(type) > 0;
      }

      @Override
      public Iterable<EvalContext> traverse(String relType, String dir) {
        if (!(objectId instanceof UUID currentObjectId)) return List.of();
        var contexts = new ArrayList<EvalContext>();
        for (var object : relatedObjects(workspaceId, currentObjectId, relType, dir)) {
          var fields = new LinkedHashMap<String, Object>(object.fields());
          fields.put("$objectId", object.objectId());
          contexts.add(context(workspaceId, object.objectTypeId(), fields));
        }
        return contexts;
      }
    };
  }

  private List<ObjectRow> relatedObjects(
      UUID workspaceId, UUID objectId, String relType, String dir) {
    var sourceSide = "out".equals(dir);
    return jdbc.query(
        """
        SELECT related.object_id, type.id, related.fields::text
        FROM rm_relation relation
        JOIN rm_object related
          ON related.workspace_id = relation.workspace_id
         AND related.object_id = CASE WHEN ? THEN relation.target_id ELSE relation.source_id END
        JOIN object_type type
          ON type.workspace_id = related.workspace_id
         AND type.code = related.object_type_code
        WHERE relation.workspace_id = ?
          AND relation.relation_type_code = ?
          AND relation.status = 'ACTIVE'
          AND related.status NOT IN ('VOID', 'FILED', 'DELETED')
          AND CASE WHEN ? THEN relation.source_id = ? ELSE relation.target_id = ? END
        ORDER BY related.object_id
        LIMIT ?
        """,
        (row, ignored) ->
            new ObjectRow(
                row.getObject(1, UUID.class), row.getObject(2, UUID.class), map(row.getString(3))),
        sourceSide,
        workspaceId,
        relType,
        sourceSide,
        objectId,
        objectId,
        MAX_RELATION_PAGE);
  }

  private int directRelationCount(UUID workspaceId, UUID objectId, String relationTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*) FROM (
          SELECT relation_id
          FROM rm_relation
          WHERE workspace_id = ?
            AND relation_type_code = ?
            AND status = 'ACTIVE'
            AND (source_id = ? OR target_id = ?)
          LIMIT 201
        ) limited_relations
        """,
        Integer.class,
        workspaceId,
        relationTypeCode,
        objectId,
        objectId);
  }

  private CommandResult replay(UUID workspaceId, String idempotencyKey, String payloadHash) {
    var stored =
        jdbc.query(
            """
            SELECT payload_hash, result_snapshot::text
            FROM command_log WHERE workspace_id = ? AND idempotency_key = ?
            """,
            (row, ignored) -> new StoredCommand(row.getString(1), row.getString(2)),
            workspaceId,
            idempotencyKey);
    if (stored.isEmpty()) return null;
    var command = stored.getFirst();
    if (!command.payloadHash().equals(payloadHash)) {
      throw new RuleCommandException(
          "RULE-409-IDEMPOTENCY-CONFLICT", "幂等键已被不同载荷使用", "更换 idempotencyKey 后重试");
    }
    try {
      return mapper.readValue(command.resultSnapshot(), CommandResult.class);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("规则检查结果快照无法解析", failure);
    }
  }

  private void remember(
      UUID workspaceId,
      String idempotencyKey,
      String commandId,
      String payloadHash,
      CommandResult result) {
    jdbc.update(
        """
        INSERT INTO command_log
          (workspace_id, idempotency_key, command_id, command_type, payload_hash,
           result_snapshot, decided_at)
        VALUES (?, ?, ?, 'RunRuleCheck', ?, CAST(? AS jsonb), ?)
        """,
        workspaceId,
        idempotencyKey,
        commandId,
        payloadHash,
        json(result),
        Timestamp.from(Instant.now()));
  }

  private void validateEnvelope(UUID workspaceId, String idempotencyKey) {
    if (workspaceId == null) {
      throw new RuleCommandException(
          "RULE-400-SCHEMA-INVALID", "workspaceId 必填", "按规则命令 Schema 修正载荷后重试");
    }
    if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128) {
      throw new RuleCommandException(
          "RULE-400-SCHEMA-INVALID", "idempotencyKey 长度必须为 1..128", "按规则命令 Schema 修正载荷后重试");
    }
  }

  private Map<String, Object> map(String value) {
    try {
      return mapper.readValue(value, new TypeReference<>() {});
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("读模型字段无法解析", failure);
    }
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("规则检查载荷无法序列化", failure);
    }
  }

  private static String interpolate(String message, EvalContext context) {
    var matcher = FIELD_PLACEHOLDER.matcher(message);
    var interpolated = new StringBuilder();
    while (matcher.find()) {
      var value = context.fieldValue(matcher.group(1));
      matcher.appendReplacement(
          interpolated, Matcher.quoteReplacement(value == null ? "" : String.valueOf(value)));
    }
    matcher.appendTail(interpolated);
    return interpolated.toString();
  }

  private static String scopeKey(RuleScopeRequest scope) {
    return scope == null || scope.objectTypeCode() == null ? "*" : scope.objectTypeCode();
  }

  private static String scopeObjectTypeCode(RuleScopeRequest scope) {
    return scope == null || scope.objectTypeCode() == null || scope.objectTypeCode().isBlank()
        ? null
        : scope.objectTypeCode();
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

  private record ObjectRow(UUID objectId, UUID objectTypeId, Map<String, Object> fields) {}

  private record RuleRow(
      String ruleCode, String severity, String whenSrc, String message, String fieldCode) {}

  private record RuleFingerprint(
      String ruleCode,
      String severity,
      String whenSrc,
      String message,
      String fieldCode,
      boolean lightweight,
      long version) {}

  private record StoredCommand(String payloadHash, String resultSnapshot) {}
}
