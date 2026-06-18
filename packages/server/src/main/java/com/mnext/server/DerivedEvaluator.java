package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.rules.EvalContext;
import com.mnext.engines.rules.RuleEvalLimitException;
import com.mnext.engines.rules.RuleEvaluator;
import com.mnext.engines.rules.RuleParser;
import com.mnext.engines.rules.RuleSyntaxException;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class DerivedEvaluator {
  private static final int MAX_RELATION_PAGE = 200;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final RuleEvaluator evaluator = new RuleEvaluator();

  DerivedEvaluator(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Transactional(readOnly = true)
  Object evaluate(UUID workspaceId, UUID objectId, String code) {
    var object = loadObject(workspaceId, objectId);
    if (object == null) return null;
    return evaluate(workspaceId, objectId, object.objectTypeId(), object.fields(), code);
  }

  @Transactional(readOnly = true)
  Object evaluate(
      UUID workspaceId, UUID objectId, UUID objectTypeId, Map<String, Object> fields, String code) {
    return evaluate(workspaceId, objectId, objectTypeId, fields, code, new EvaluationState());
  }

  private Object evaluate(
      UUID workspaceId,
      UUID objectId,
      UUID objectTypeId,
      Map<String, Object> fields,
      String code,
      EvaluationState state) {
    var key = key(objectId, objectTypeId, fields, code);
    if (state.memo().containsKey(key)) {
      return state.memo().get(key);
    }
    if (!state.visiting().add(key)) {
      throw error(
          "DERIVE-409-DEPENDENCY-CYCLE", "派生字段运行期依赖成环", Map.of("field", code), "检查派生字段依赖定义");
    }
    var definition = definition(workspaceId, objectTypeId, code);
    if (definition == null) {
      state.visiting().remove(key);
      return null;
    }
    try {
      var expression = RuleParser.parse(definition.derivation());
      var value =
          evaluator.evaluateValue(
              expression,
              new ReadModelEvalContext(workspaceId, objectId, objectTypeId, fields, state));
      state.memo().put(key, value);
      return value;
    } catch (RuleEvalLimitException failure) {
      throw error(
          "DERIVE-422-EVAL-LIMIT",
          "派生表达式求值超过上限",
          Map.of("field", code, "reason", failure.getMessage()),
          "收窄遍历范围或拆分派生表达式");
    } catch (RuleSyntaxException failure) {
      throw error(
          "DERIVE-400-SYNTAX-INVALID",
          "派生表达式语法无效",
          Map.of("field", code, "reason", failure.getMessage()),
          "修正派生表达式后重试");
    } finally {
      state.visiting().remove(key);
    }
  }

  private DerivedDefinition definition(UUID workspaceId, UUID objectTypeId, String code) {
    if (objectTypeId == null || code == null) return null;
    var definitions =
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
              WHERE parent.workspace_id = ? AND child.depth < 32
            )
            SELECT derived.code, derived.derivation
            FROM derived_field derived
            JOIN type_chain type ON type.id = derived.object_type_id
            WHERE derived.workspace_id = ? AND derived.code = ?
            ORDER BY type.depth
            LIMIT 1
            """,
            (row, ignored) -> new DerivedDefinition(row.getString(1), row.getString(2)),
            workspaceId,
            objectTypeId,
            workspaceId,
            workspaceId,
            code);
    return definitions.isEmpty() ? null : definitions.getFirst();
  }

  private ObjectRow loadObject(UUID workspaceId, UUID objectId) {
    if (objectId == null) return null;
    var rows =
        jdbc.query(
            """
            SELECT object.object_id, type.id, object.fields::text
            FROM rm_object object
            JOIN object_type type
              ON type.workspace_id = object.workspace_id
             AND type.code = object.object_type_code
            WHERE object.workspace_id = ? AND object.object_id = ?
            """,
            (row, ignored) ->
                new ObjectRow(
                    row.getObject(1, UUID.class),
                    row.getObject(2, UUID.class),
                    map(row.getString(3))),
            workspaceId,
            objectId);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private List<ObjectRow> relatedObjects(
      UUID workspaceId, UUID objectId, String relType, String dir) {
    if (objectId == null) return List.of();
    var sourceSide = "out".equals(dir);
    var sql =
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
          AND CASE WHEN ? THEN relation.source_id = ? ELSE relation.target_id = ? END
        ORDER BY related.object_id
        LIMIT ?
        """;
    return jdbc.query(
        sql,
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

  private Map<String, Object> map(String json) {
    try {
      return mapper.readValue(json, new TypeReference<>() {});
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("读模型字段无法解析", failure);
    }
  }

  private DerivedKey key(
      UUID objectId, UUID objectTypeId, Map<String, Object> fields, String code) {
    return new DerivedKey(objectId, objectTypeId, System.identityHashCode(fields), code);
  }

  private static CommandRejectedException error(
      String code, String message, Map<String, Object> details, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, details, suggestion));
  }

  private final class ReadModelEvalContext implements EvalContext {
    private final UUID workspaceId;
    private final UUID objectId;
    private final UUID objectTypeId;
    private final Map<String, Object> fields;
    private final EvaluationState state;

    private ReadModelEvalContext(
        UUID workspaceId,
        UUID objectId,
        UUID objectTypeId,
        Map<String, Object> fields,
        EvaluationState state) {
      this.workspaceId = workspaceId;
      this.objectId = objectId;
      this.objectTypeId = objectTypeId;
      this.fields = fields;
      this.state = state;
    }

    @Override
    public Object fieldValue(String code) {
      if (fields.containsKey(code)) {
        return fields.get(code);
      }
      return evaluate(workspaceId, objectId, objectTypeId, fields, code, state);
    }

    @Override
    public int relationCount(String type) {
      return relatedObjects(workspaceId, objectId, type, "out").size()
          + relatedObjects(workspaceId, objectId, type, "in").size();
    }

    @Override
    public boolean hasRelation(String type) {
      return relationCount(type) > 0;
    }

    @Override
    public Iterable<EvalContext> traverse(String relType, String dir) {
      var contexts = new ArrayList<EvalContext>();
      for (var object : relatedObjects(workspaceId, objectId, relType, dir)) {
        contexts.add(
            new ReadModelEvalContext(
                workspaceId, object.objectId(), object.objectTypeId(), object.fields(), state));
      }
      return contexts;
    }
  }

  private record ObjectRow(UUID objectId, UUID objectTypeId, Map<String, Object> fields) {}

  private record DerivedDefinition(String code, String derivation) {}

  private record DerivedKey(UUID objectId, UUID objectTypeId, int fieldsIdentity, String code) {}

  private record EvaluationState(Map<DerivedKey, Object> memo, Set<DerivedKey> visiting) {
    private EvaluationState() {
      this(new HashMap<>(), new HashSet<>());
    }
  }
}
