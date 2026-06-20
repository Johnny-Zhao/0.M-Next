package com.mnext.server.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.mnext.server.DerivedEvaluator;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AiContextAssembler {
  public static final int MAX_AI_OBJECTS = 50;
  private static final int MAX_CHECK_RESULTS = 200;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final DerivedEvaluator derivedEvaluator;
  private final SkillRegistry skills;

  public AiContextAssembler(
      JdbcTemplate jdbc,
      ObjectMapper mapper,
      DerivedEvaluator derivedEvaluator,
      SkillRegistry skills) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.derivedEvaluator = derivedEvaluator;
    this.skills = skills;
  }

  @Transactional(readOnly = true)
  public AiContext assemble(
      UUID workspaceId,
      String actorId,
      AiContext.SelectionCtx selection,
      String action,
      String instruction,
      AiActionProvider.ProviderDescriptor provider) {
    var objectIds = selection == null ? List.<UUID>of() : bounded(selection.objectIds());
    var checkResultIds =
        selection == null ? List.<UUID>of() : nullToEmpty(selection.checkResultIds());
    var objects = selectedObjects(workspaceId, objectIds);
    var fields = objectFields(workspaceId, objects);
    var fieldDefs = fieldDefs(workspaceId, objects);
    var rules = rules(workspaceId, objects);
    var checks = checkResults(workspaceId, objectIds, checkResultIds);
    var replay =
        Map.<String, Object>of(
            "action", action,
            "instruction", instruction == null ? "" : instruction,
            "objectIds", objectIds,
            "checkResultIds", checkResultIds);
    var management = new AiContext.ManagementCtx(objects, checks, rules);
    var process = new AiContext.ProcessCtx(fieldDefs);
    var result = new AiContext.ResultCtx(fields);
    var interaction =
        new AiContext.InteractionCtx(
            new AiContext.SelectionCtx(objectIds, checkResultIds), action, instruction, actorId);
    var substrate = new AiContext.SubstrateCtx(provider, replay, skills.engineIds());
    var hash = hash(management, process, result, interaction, substrate);
    return new AiContext(management, process, result, interaction, substrate, hash);
  }

  private List<UUID> bounded(List<UUID> objectIds) {
    var values = nullToEmpty(objectIds);
    if (values.size() > MAX_AI_OBJECTS) {
      throw new IllegalArgumentException("selection.objectIds 最多 50 个");
    }
    return values;
  }

  private List<UUID> nullToEmpty(List<UUID> values) {
    return values == null ? List.of() : values.stream().distinct().sorted().toList();
  }

  private List<AiContext.SelectedObjectCtx> selectedObjects(
      UUID workspaceId, List<UUID> objectIds) {
    if (objectIds.isEmpty()) return List.of();
    return jdbc.query(
        """
        SELECT object.object_id, type.id, object.object_type_code, object.status, object.version
        FROM rm_object object
        JOIN object_type type
          ON type.workspace_id = object.workspace_id
         AND type.code = object.object_type_code
        WHERE object.workspace_id = ? AND object.object_id IN (%s)
        ORDER BY object.object_id
        """
            .formatted(placeholders(objectIds.size())),
        (row, ignored) ->
            new AiContext.SelectedObjectCtx(
                row.getObject(1, UUID.class),
                row.getObject(2, UUID.class),
                row.getString(3),
                row.getString(4),
                row.getLong(5)),
        args(workspaceId, objectIds));
  }

  private Map<UUID, Map<String, Object>> objectFields(
      UUID workspaceId, List<AiContext.SelectedObjectCtx> objects) {
    var values = new LinkedHashMap<UUID, Map<String, Object>>();
    for (var object : objects) {
      Map<String, Object> fields =
          jdbc.query(
              """
              SELECT fields::text FROM rm_object
              WHERE workspace_id = ? AND object_id = ?
              """,
              result ->
                  result.next() ? map(result.getString(1)) : new LinkedHashMap<String, Object>(),
              workspaceId,
              object.objectId());
      var enriched = new LinkedHashMap<String, Object>(fields);
      for (var derived : derivedCodes(workspaceId, object.objectTypeId())) {
        if (!enriched.containsKey(derived)) {
          enriched.put(derived, derivedEvaluator.evaluate(workspaceId, object.objectId(), derived));
        }
      }
      values.put(object.objectId(), enriched);
    }
    return values;
  }

  private Map<String, List<AiContext.FieldDefCtx>> fieldDefs(
      UUID workspaceId, List<AiContext.SelectedObjectCtx> objects) {
    var values = new LinkedHashMap<String, List<AiContext.FieldDefCtx>>();
    for (var object : objects) {
      values.putIfAbsent(object.objectType(), effectiveFields(workspaceId, object));
    }
    return values;
  }

  private List<AiContext.FieldDefCtx> effectiveFields(
      UUID workspaceId, AiContext.SelectedObjectCtx object) {
    return jdbc.query(
        """
        WITH RECURSIVE type_chain AS (
          SELECT type.id AS type_id, type.id AS ancestor_type_id, 0 AS depth
          FROM object_type type WHERE type.workspace_id = ? AND type.id = ?
          UNION ALL
          SELECT chain.type_id, parent.id, chain.depth + 1
          FROM type_chain chain
          JOIN object_type child ON child.id = chain.ancestor_type_id
          JOIN object_type parent ON parent.id = child.parent_type_id
          WHERE parent.workspace_id = ? AND chain.depth < 32
        ),
        field_candidate AS (
          SELECT chain.depth, field.code, field.name, field.data_type, field.value_type_id,
                 field.required, field.constraints
          FROM type_chain chain
          JOIN field_def field ON field.object_type_id = chain.ancestor_type_id
        ),
        effective_field AS (
          SELECT DISTINCT ON (code)
                 code, name, data_type, value_type_id, required, constraints
          FROM field_candidate ORDER BY code, depth ASC
        )
        SELECT effective_field.code, effective_field.name,
               COALESCE(value_type.base_primitive, effective_field.data_type) AS data_type,
               effective_field.required,
               (COALESCE(value_type.constraints, '{}'::jsonb)
                || COALESCE(effective_field.constraints, '{}'::jsonb))::text AS constraints
        FROM effective_field
        LEFT JOIN value_type ON value_type.id = effective_field.value_type_id
        ORDER BY code
        """,
        (row, ignored) ->
            new AiContext.FieldDefCtx(
                object.objectType(),
                row.getString(1),
                row.getString(2),
                row.getString(3),
                row.getBoolean(4),
                map(row.getString(5))),
        workspaceId,
        object.objectTypeId(),
        workspaceId);
  }

  private List<String> derivedCodes(UUID workspaceId, UUID objectTypeId) {
    return jdbc.query(
        """
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_type_id FROM object_type WHERE workspace_id = ? AND id = ?
          UNION ALL
          SELECT parent.id, parent.parent_type_id
          FROM object_type parent
          JOIN ancestors child ON parent.id = child.parent_type_id
          WHERE parent.workspace_id = ?
        )
        SELECT code FROM derived_field
        WHERE workspace_id = ? AND object_type_id IN (SELECT id FROM ancestors)
        ORDER BY code LIMIT 50
        """,
        (row, ignored) -> row.getString(1),
        workspaceId,
        objectTypeId,
        workspaceId,
        workspaceId);
  }

  private List<AiContext.RuleDefCtx> rules(
      UUID workspaceId, List<AiContext.SelectedObjectCtx> objects) {
    var values = new LinkedHashMap<String, AiContext.RuleDefCtx>();
    for (var object : objects) {
      for (var rule : rulesForType(workspaceId, object.objectTypeId()))
        values.put(rule.ruleCode(), rule);
    }
    return List.copyOf(values.values());
  }

  private List<AiContext.RuleDefCtx> rulesForType(UUID workspaceId, UUID objectTypeId) {
    return jdbc.query(
        """
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_type_id FROM object_type WHERE workspace_id = ? AND id = ?
          UNION ALL
          SELECT parent.id, parent.parent_type_id
          FROM object_type parent
          JOIN ancestors child ON parent.id = child.parent_type_id
          WHERE parent.workspace_id = ?
        )
        SELECT rule.rule_code, rule.severity, rule.when_src, rule.message,
               field.code, rule.lightweight, rule.version
        FROM rule_def rule
        LEFT JOIN field_def field ON field.id = rule.scope_field_def_id
        WHERE rule.workspace_id = ? AND rule.published = TRUE
          AND rule.scope_object_type_id IN (SELECT id FROM ancestors)
        ORDER BY rule.rule_code
        """,
        (row, ignored) ->
            new AiContext.RuleDefCtx(
                row.getString(1),
                row.getString(2),
                row.getString(3),
                row.getString(4),
                row.getString(5),
                row.getBoolean(6),
                row.getLong(7)),
        workspaceId,
        objectTypeId,
        workspaceId,
        workspaceId);
  }

  private List<AiContext.CheckResultCtx> checkResults(
      UUID workspaceId, List<UUID> objectIds, List<UUID> checkResultIds) {
    if (!checkResultIds.isEmpty()) {
      return checkResultsByIds(workspaceId, checkResultIds);
    }
    if (objectIds.isEmpty()) return List.of();
    return jdbc.query(
        """
        SELECT id, run_id, rule_code, severity, message, object_id,
               field_code, config_hash, created_at
        FROM check_result
        WHERE workspace_id = ? AND object_id IN (%s)
        ORDER BY created_at DESC, id LIMIT ?
        """
            .formatted(placeholders(objectIds.size())),
        (row, ignored) -> checkResult(row),
        args(workspaceId, objectIds, MAX_CHECK_RESULTS));
  }

  private List<AiContext.CheckResultCtx> checkResultsByIds(
      UUID workspaceId, List<UUID> checkResultIds) {
    return jdbc.query(
        """
        SELECT id, run_id, rule_code, severity, message, object_id,
               field_code, config_hash, created_at
        FROM check_result
        WHERE workspace_id = ? AND id IN (%s)
        ORDER BY created_at DESC, id LIMIT ?
        """
            .formatted(placeholders(checkResultIds.size())),
        (row, ignored) -> checkResult(row),
        args(workspaceId, checkResultIds, MAX_CHECK_RESULTS));
  }

  private AiContext.CheckResultCtx checkResult(ResultSet row) throws SQLException {
    return new AiContext.CheckResultCtx(
        row.getObject(1, UUID.class),
        row.getObject(2, UUID.class),
        row.getString(3),
        row.getString(4),
        row.getString(5),
        row.getObject(6, UUID.class),
        row.getString(7),
        row.getString(8),
        row.getTimestamp(9).toInstant());
  }

  private String hash(Object... parts) {
    try {
      var stable = mapper.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
      var bytes = stable.writeValueAsBytes(List.of(parts));
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (JsonProcessingException | NoSuchAlgorithmException failure) {
      throw new IllegalStateException("AI 上下文哈希失败", failure);
    }
  }

  private Map<String, Object> map(String value) {
    try {
      return mapper.readValue(value, new TypeReference<>() {});
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("AI 上下文字段无法解析", failure);
    }
  }

  private static String placeholders(int size) {
    return String.join(",", java.util.Collections.nCopies(size, "?"));
  }

  private static Object[] args(Object first, List<UUID> ids) {
    return args(first, ids, null);
  }

  private static Object[] args(Object first, List<UUID> ids, Object last) {
    var values = new ArrayList<Object>();
    values.add(first);
    values.addAll(ids);
    if (last != null) values.add(last);
    return values.toArray();
  }
}
