package com.mnext.server;

import com.mnext.engines.rules.EvalContext;
import com.mnext.engines.rules.RuleEvaluator;
import com.mnext.engines.rules.RuleParser;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.RuleChecker;
import com.mnext.kernel.api.RuleViolation;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Primary
@Component
public class EnginesRuleChecker implements RuleChecker {
  private static final Pattern FIELD_PLACEHOLDER =
      Pattern.compile("\\$\\{field\\('([a-z][a-z0-9_]{0,127})'\\)\\}");
  private final JdbcTemplate jdbc;
  private final RuleEvaluator evaluator = new RuleEvaluator();

  EnginesRuleChecker(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public List<RuleViolation> check(
      UUID workspaceId, UUID objectTypeId, Map<String, Object> effectiveFieldValues, Actor actor) {
    var violations = new ArrayList<RuleViolation>();
    for (var rule : applicableRules(workspaceId, objectTypeId)) {
      if (rule.fieldCode() != null && !effectiveFieldValues.containsKey(rule.fieldCode())) {
        continue;
      }
      var expression = RuleParser.parse(rule.whenSrc());
      if (evaluator.evaluate(expression, context(workspaceId, effectiveFieldValues))) {
        violations.add(
            new RuleViolation(
                rule.ruleCode(),
                rule.severity(),
                interpolate(rule.message(), effectiveFieldValues)));
      }
    }
    return violations;
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
          AND rule.lightweight = TRUE
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

  private EvalContext context(UUID workspaceId, Map<String, Object> effectiveFieldValues) {
    var objectId = effectiveFieldValues.get("$objectId");
    return new EvalContext() {
      @Override
      public Object fieldValue(String code) {
        return effectiveFieldValues.get(code);
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
    };
  }

  private int directRelationCount(UUID workspaceId, UUID objectId, String relationTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*) FROM (
          SELECT relation.id
          FROM data_relation relation
          JOIN relation_type type ON type.id = relation.relation_type_id
          WHERE relation.workspace_id = ?
            AND type.code = ?
            AND relation.status = 'ACTIVE'
            AND (relation.source_id = ? OR relation.target_id = ?)
          LIMIT 201
        ) limited_relations
        """,
        Integer.class,
        workspaceId,
        relationTypeCode,
        objectId,
        objectId);
  }

  private static String interpolate(String message, Map<String, Object> effectiveFieldValues) {
    var matcher = FIELD_PLACEHOLDER.matcher(message);
    var interpolated = new StringBuilder();
    while (matcher.find()) {
      var value = effectiveFieldValues.get(matcher.group(1));
      matcher.appendReplacement(
          interpolated, Matcher.quoteReplacement(value == null ? "" : String.valueOf(value)));
    }
    matcher.appendTail(interpolated);
    return interpolated.toString();
  }

  private record RuleRow(
      String ruleCode, String severity, String whenSrc, String message, String fieldCode) {}
}
