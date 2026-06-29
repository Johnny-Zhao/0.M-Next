package com.mnext.server;

import com.mnext.engines.rules.Aggregate;
import com.mnext.engines.rules.Arithmetic;
import com.mnext.engines.rules.Comparison;
import com.mnext.engines.rules.Conditional;
import com.mnext.engines.rules.FieldRef;
import com.mnext.engines.rules.FunctionCall;
import com.mnext.engines.rules.Literal;
import com.mnext.engines.rules.Logical;
import com.mnext.engines.rules.Not;
import com.mnext.engines.rules.OclIteration;
import com.mnext.engines.rules.RuleExpression;
import com.mnext.engines.rules.RuleSyntaxException;
import com.mnext.engines.rules.Traverse;
import com.mnext.engines.rules.TraverseDeep;
import com.mnext.engines.rules.TraverseFrom;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class LineageQueryRepository {
  private static final int MAX_DEPTH = 2;
  private static final int MAX_NODES = 200;
  private final JdbcTemplate jdbc;

  LineageQueryRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  LineageView lineage(UUID workspaceId, UUID objectId, String fieldCode) {
    var object = object(workspaceId, objectId);
    if (object == null) {
      throw new IllegalArgumentException("对象不存在或不可见");
    }
    var state = new LineageState();
    var definition = derivedDefinition(workspaceId, object.objectTypeId(), fieldCode);
    if (definition == null) {
      return new LineageView(
          objectId,
          fieldCode,
          List.of(),
          new LineageAlgorithm("stored", fieldCode),
          downstream(workspaceId, object.objectTypeId(), fieldCode, state),
          state.partial(),
          state.truncated());
    }
    var upstream = upstream(workspaceId, object, definition.derivation(), state);
    var downstream = downstream(workspaceId, object.objectTypeId(), fieldCode, state);
    return new LineageView(
        objectId,
        fieldCode,
        upstream,
        new LineageAlgorithm("derived", definition.id().toString()),
        downstream,
        state.partial(),
        state.truncated());
  }

  private List<LineageNode> upstream(
      UUID workspaceId, LineageObject object, String derivation, LineageState state) {
    var expression = parse(derivation, state);
    if (expression == null) {
      return List.of();
    }
    var result = new ArrayList<LineageNode>();
    collectUpstream(workspaceId, object, expression, 0, result, state);
    return List.copyOf(result);
  }

  private void collectUpstream(
      UUID workspaceId,
      LineageObject object,
      RuleExpression expression,
      int depth,
      List<LineageNode> result,
      LineageState state) {
    for (var reference : references(expression)) {
      if (reference.path().isEmpty()) {
        addFieldNode(object, reference.fieldCode(), depth, result, state);
        var nested = derivedDefinition(workspaceId, object.objectTypeId(), reference.fieldCode());
        if (nested != null && depth < MAX_DEPTH) {
          collectUpstream(
              workspaceId,
              object,
              parseOrPartial(nested.derivation(), state),
              depth + 1,
              result,
              state);
        } else if (nested != null) {
          state.truncate();
        }
      } else {
        for (var related :
            relatedObjects(workspaceId, object.objectId(), reference.path(), state)) {
          addFieldNode(
              related,
              reference.fieldCode(),
              Math.min(depth + reference.path().size(), MAX_DEPTH),
              result,
              state);
        }
      }
    }
  }

  private RuleExpression parseOrPartial(String source, LineageState state) {
    var expression = parse(source, state);
    return expression == null ? new Literal(null) : expression;
  }

  private void addFieldNode(
      LineageObject object,
      String fieldCode,
      int depth,
      List<LineageNode> result,
      LineageState state) {
    if (depth > MAX_DEPTH) {
      state.truncate();
      return;
    }
    if (!state.addNode("field:" + object.objectId() + ":" + fieldCode)) {
      return;
    }
    if (result.size() >= MAX_NODES) {
      state.truncate();
      return;
    }
    result.add(
        new LineageNode(
            "field",
            object.objectId(),
            object.objectTypeCode(),
            fieldCode,
            null,
            object.source(),
            object.updatedAt(),
            depth));
  }

  private List<LineageNode> downstream(
      UUID workspaceId, UUID objectTypeId, String fieldCode, LineageState state) {
    var result = new ArrayList<LineageNode>();
    for (var derived : derivedDefinitions(workspaceId, objectTypeId)) {
      var expression = parse(derived.derivation(), state);
      if (expression != null
          && references(expression).stream().anyMatch(ref -> fieldCode.equals(ref.fieldCode()))) {
        addDownstream(
            "derived", null, null, derived.code(), derived.id().toString(), result, state);
      }
    }
    for (var rule : rules(workspaceId, objectTypeId)) {
      var expression = parse(rule.whenSource(), state);
      if (expression != null
          && references(expression).stream().anyMatch(ref -> fieldCode.equals(ref.fieldCode()))) {
        addDownstream("rule", null, null, null, rule.ruleCode(), result, state);
      }
    }
    return List.copyOf(result);
  }

  private void addDownstream(
      String kind,
      UUID objectId,
      String objectType,
      String fieldCode,
      String ref,
      List<LineageNode> result,
      LineageState state) {
    if (result.size() >= MAX_NODES) {
      state.truncate();
      return;
    }
    result.add(new LineageNode(kind, objectId, objectType, fieldCode, ref, null, null, 1));
  }

  private LineageObject object(UUID workspaceId, UUID objectId) {
    var rows =
        jdbc.query(
            """
            SELECT object.object_id, object.object_type_code, type.id, object.source_kind,
                   object.updated_at
            FROM rm_object object
            JOIN object_type type
              ON type.workspace_id = object.workspace_id
             AND type.code = object.object_type_code
            WHERE object.workspace_id = ? AND object.object_id = ?
            """,
            (row, index) ->
                new LineageObject(
                    row.getObject(1, UUID.class),
                    row.getString(2),
                    row.getObject(3, UUID.class),
                    row.getString(4),
                    row.getTimestamp(5).toInstant()),
            workspaceId,
            objectId);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private DerivedDef derivedDefinition(UUID workspaceId, UUID objectTypeId, String fieldCode) {
    var rows = derivedDefinitions(workspaceId, objectTypeId, fieldCode);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private List<DerivedDef> derivedDefinitions(UUID workspaceId, UUID objectTypeId) {
    return derivedDefinitions(workspaceId, objectTypeId, null);
  }

  private List<DerivedDef> derivedDefinitions(
      UUID workspaceId, UUID objectTypeId, String fieldCode) {
    var args = new ArrayList<Object>();
    args.add(workspaceId);
    args.add(objectTypeId);
    args.add(workspaceId);
    args.add(workspaceId);
    var filter = "";
    if (fieldCode != null) {
      filter = " AND derived.code = ?";
      args.add(fieldCode);
    }
    return jdbc.query(
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
        SELECT derived.id, derived.code, derived.derivation
        FROM derived_field derived
        JOIN type_chain type ON type.id = derived.object_type_id
        WHERE derived.workspace_id = ?%s
        ORDER BY type.depth, derived.code
        """
            .formatted(filter),
        (row, index) ->
            new DerivedDef(row.getObject(1, UUID.class), row.getString(2), row.getString(3)),
        args.toArray());
  }

  private List<RuleDef> rules(UUID workspaceId, UUID objectTypeId) {
    return jdbc.query(
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
        SELECT rule_code, when_src
        FROM rule_def
        WHERE workspace_id = ?
          AND scope_object_type_id IN (SELECT id FROM type_chain)
        ORDER BY rule_code
        LIMIT ?
        """,
        (row, index) -> new RuleDef(row.getString(1), row.getString(2)),
        workspaceId,
        objectTypeId,
        workspaceId,
        workspaceId,
        MAX_NODES + 1);
  }

  private List<LineageObject> relatedObjects(
      UUID workspaceId, UUID rootId, List<RelationStep> path, LineageState state) {
    var current = List.of(rootId);
    var depth = 0;
    for (var step : path) {
      depth++;
      if (depth > MAX_DEPTH) {
        state.truncate();
        break;
      }
      current = relatedIds(workspaceId, current, step);
      if (current.isEmpty()) {
        return List.of();
      }
      if (current.size() > MAX_NODES) {
        current = current.subList(0, MAX_NODES);
        state.truncate();
      }
    }
    return objects(workspaceId, current);
  }

  private List<UUID> relatedIds(UUID workspaceId, List<UUID> objectIds, RelationStep step) {
    if (objectIds.isEmpty()) return List.of();
    var endpoint = "out".equals(step.direction()) ? "source_id" : "target_id";
    var next = "out".equals(step.direction()) ? "target_id" : "source_id";
    return jdbc.query(
        """
        SELECT DISTINCT relation.%s
        FROM rm_relation relation
        WHERE relation.workspace_id = ?
          AND relation.relation_type_code = ?
          AND relation.%s IN (%s)
          AND relation.status = 'ACTIVE'
        ORDER BY relation.%s
        LIMIT ?
        """
            .formatted(next, endpoint, placeholders(objectIds.size()), next),
        (row, index) -> row.getObject(1, UUID.class),
        args(workspaceId, step.relationType(), objectIds, MAX_NODES + 1));
  }

  private List<LineageObject> objects(UUID workspaceId, List<UUID> objectIds) {
    if (objectIds.isEmpty()) return List.of();
    return jdbc.query(
        """
        SELECT object.object_id, object.object_type_code, type.id, object.source_kind,
               object.updated_at
        FROM rm_object object
        JOIN object_type type
          ON type.workspace_id = object.workspace_id
         AND type.code = object.object_type_code
        WHERE object.workspace_id = ? AND object.object_id IN (%s)
        ORDER BY object.object_id
        """
            .formatted(placeholders(objectIds.size())),
        (row, index) ->
            new LineageObject(
                row.getObject(1, UUID.class),
                row.getString(2),
                row.getObject(3, UUID.class),
                row.getString(4),
                row.getTimestamp(5).toInstant()),
        args(workspaceId, objectIds));
  }

  private RuleExpression parse(String source, LineageState state) {
    try {
      return ExpressionLanguageSupport.parse(source);
    } catch (RuleSyntaxException failure) {
      state.markPartial();
      return null;
    }
  }

  private Set<FieldReference> references(RuleExpression expression) {
    var result = new LinkedHashSet<FieldReference>();
    collectReferences(expression, List.of(), result);
    return result;
  }

  private void collectReferences(
      RuleExpression expression, List<RelationStep> path, Set<FieldReference> result) {
    switch (expression) {
      case FieldRef fieldRef -> result.add(new FieldReference(path, fieldRef.code()));
      case Comparison comparison -> {
        collectReferences(comparison.left(), path, result);
        collectReferences(comparison.right(), path, result);
      }
      case Logical logical -> {
        collectReferences(logical.left(), path, result);
        collectReferences(logical.right(), path, result);
      }
      case Not not -> collectReferences(not.expression(), path, result);
      case FunctionCall call ->
          call.arguments().forEach(argument -> collectReferences(argument, path, result));
      case Aggregate aggregate -> collectAggregateReferences(aggregate, path, result);
      case Arithmetic arithmetic -> {
        collectReferences(arithmetic.left(), path, result);
        collectReferences(arithmetic.right(), path, result);
      }
      case Conditional conditional -> {
        collectReferences(conditional.condition(), path, result);
        collectReferences(conditional.ifTrue(), path, result);
        collectReferences(conditional.ifFalse(), path, result);
      }
      case Traverse traverse -> {}
      case TraverseFrom traverseFrom -> collectReferences(traverseFrom.source(), path, result);
      case TraverseDeep traverseDeep -> collectReferences(traverseDeep.maxDepth(), path, result);
      case OclIteration iteration -> collectOclIterationReferences(iteration, path, result);
      case Literal literal -> {}
      default -> {}
    }
  }

  private void collectOclIterationReferences(
      OclIteration iteration, List<RelationStep> path, Set<FieldReference> result) {
    var iterationPath = pathFor(iteration.source(), path);
    collectReferences(iteration.source(), path, result);
    if (iteration.expression() != null) {
      collectReferences(iteration.expression(), iterationPath, result);
    }
  }

  private void collectAggregateReferences(
      Aggregate aggregate, List<RelationStep> path, Set<FieldReference> result) {
    var aggregatePath = pathFor(aggregate.source(), path);
    if (aggregate.field() != null) {
      result.add(new FieldReference(aggregatePath, aggregate.field()));
    }
    collectReferences(aggregate.source(), path, result);
    if (aggregate.predicate() != null) {
      collectReferences(aggregate.predicate(), aggregatePath, result);
    }
  }

  private List<RelationStep> pathFor(RuleExpression source, List<RelationStep> basePath) {
    if (source instanceof Traverse traverse) {
      return append(basePath, new RelationStep(traverse.relType(), traverse.dir()));
    }
    if (source instanceof TraverseFrom traverseFrom) {
      return append(
          pathFor(traverseFrom.source(), basePath),
          new RelationStep(traverseFrom.relType(), traverseFrom.dir()));
    }
    if (source instanceof TraverseDeep traverseDeep) {
      var requestedDepth = intLiteral(traverseDeep.maxDepth());
      var path = new ArrayList<>(basePath);
      var depth = requestedDepth == null ? MAX_DEPTH : Math.min(requestedDepth, MAX_DEPTH + 1);
      for (var index = 0; index < depth; index++) {
        path.add(new RelationStep(traverseDeep.relType(), traverseDeep.dir()));
      }
      return List.copyOf(path);
    }
    return basePath;
  }

  private List<RelationStep> append(List<RelationStep> path, RelationStep step) {
    var result = new ArrayList<>(path);
    result.add(step);
    return List.copyOf(result);
  }

  private Integer intLiteral(RuleExpression expression) {
    if (!(expression instanceof Literal literal)
        || !(literal.value() instanceof BigDecimal value)) {
      return null;
    }
    try {
      return value.intValueExact();
    } catch (ArithmeticException ignored) {
      return null;
    }
  }

  private String placeholders(int count) {
    return String.join(", ", java.util.Collections.nCopies(count, "?"));
  }

  private Object[] args(Object first, Object second, List<?> values, Object last) {
    var result = new ArrayList<Object>();
    result.add(first);
    result.add(second);
    result.addAll(values);
    result.add(last);
    return result.toArray();
  }

  private Object[] args(Object first, List<?> values) {
    var result = new ArrayList<Object>();
    result.add(first);
    result.addAll(values);
    return result.toArray();
  }

  private record LineageObject(
      UUID objectId, String objectTypeCode, UUID objectTypeId, String source, Instant updatedAt) {}

  private record DerivedDef(UUID id, String code, String derivation) {}

  private record RuleDef(String ruleCode, String whenSource) {}

  private record RelationStep(String relationType, String direction) {}

  private record FieldReference(List<RelationStep> path, String fieldCode) {}

  private static final class LineageState {
    private final Set<String> seenNodes = new LinkedHashSet<>();
    private boolean partial;
    private boolean truncated;

    boolean addNode(String key) {
      return seenNodes.add(key);
    }

    void markPartial() {
      partial = true;
    }

    void truncate() {
      truncated = true;
    }

    boolean partial() {
      return partial;
    }

    boolean truncated() {
      return truncated;
    }
  }
}
