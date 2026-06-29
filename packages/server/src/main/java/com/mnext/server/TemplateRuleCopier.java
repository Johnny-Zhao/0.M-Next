package com.mnext.server;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class TemplateRuleCopier {
  private final JdbcTemplate jdbc;

  TemplateRuleCopier(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  void copyForInstantiate(UUID templateVersionId, UUID newWorkspaceId) {
    for (var rule : templateRules(templateVersionId)) {
      if (!ruleExists(newWorkspaceId, rule.ruleCode())) {
        copyRule(rule, newWorkspaceId);
      }
    }
  }

  void copyNewRules(UUID toVersionId, UUID workspaceId) {
    for (var rule : templateRules(toVersionId)) {
      if (!ruleExists(workspaceId, rule.ruleCode())) {
        copyRule(rule, workspaceId);
      }
    }
  }

  void copyForApplyProfile(UUID templateVersionId, UUID workspaceId) {
    for (var rule : templateRules(templateVersionId)) {
      if (!ruleExists(workspaceId, rule.ruleCode())) {
        copyRule(rule, workspaceId, templateVersionId);
      }
    }
  }

  private void copyRule(TemplateRule rule, UUID workspaceId) {
    copyRule(rule, workspaceId, null);
  }

  private void copyRule(TemplateRule rule, UUID workspaceId, UUID templateVersionId) {
    var scope =
        resolveScope(workspaceId, templateVersionId, rule.objectTypeCode(), rule.fieldCode());
    var now = Timestamp.from(Instant.now());
    jdbc.update(
        """
        INSERT INTO rule_def
          (id, workspace_id, template_version_id, rule_code, scope_object_type_id,
           scope_field_def_id, severity, when_src, message, impact, suggest, fix,
           lightweight, published, version, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, CAST(? AS jsonb),
                ?, ?, ?, ?, ?, ?, ?)
        """,
        UUID.randomUUID(),
        workspaceId,
        rule.ruleCode(),
        scope.objectTypeId(),
        scope.fieldDefId(),
        rule.severity(),
        rule.whenSrc(),
        rule.message(),
        rule.impactJson(),
        rule.suggest(),
        rule.fixJson(),
        rule.lightweight(),
        rule.published(),
        rule.version(),
        rule.createdBy(),
        rule.updatedBy(),
        now,
        now);
  }

  private List<TemplateRule> templateRules(UUID templateVersionId) {
    return jdbc.query(
        """
        SELECT rule.rule_code, type.code AS object_type_code, field.code AS field_code,
          rule.severity, rule.when_src, rule.message, rule.impact::text AS impact_json,
          rule.suggest, rule.fix::text AS fix_json, rule.lightweight, rule.published,
          rule.version, rule.created_by, rule.updated_by
        FROM rule_def rule
        JOIN object_type type ON type.id = rule.scope_object_type_id
        LEFT JOIN field_def field ON field.id = rule.scope_field_def_id
        WHERE rule.template_version_id = ?
        ORDER BY rule.rule_code
        """,
        (result, ignored) -> templateRule(result),
        templateVersionId);
  }

  private ScopeIds resolveScope(UUID workspaceId, String objectTypeCode, String fieldCode) {
    return resolveScope(workspaceId, null, objectTypeCode, fieldCode);
  }

  private ScopeIds resolveScope(
      UUID workspaceId, UUID templateVersionId, String objectTypeCode, String fieldCode) {
    var objectTypeId =
        jdbc.query(
            """
            SELECT id FROM object_type
            WHERE workspace_id = ?
              AND template_version_id IS NOT DISTINCT FROM ?
              AND code = ?
            """,
            (row, ignored) -> row.getObject("id", UUID.class),
            workspaceId,
            templateVersionId,
            objectTypeCode);
    if (objectTypeId.isEmpty()) {
      throw new IllegalStateException("模板规则 scope 对象类型无法在目标空间解析");
    }
    if (fieldCode == null) return new ScopeIds(objectTypeId.getFirst(), null);
    return new ScopeIds(objectTypeId.getFirst(), resolveField(objectTypeId.getFirst(), fieldCode));
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
            (row, ignored) -> row.getObject("id", UUID.class),
            objectTypeId,
            fieldCode);
    if (fieldIds.isEmpty()) {
      throw new IllegalStateException("模板规则 scope 字段无法在目标空间解析");
    }
    return fieldIds.getFirst();
  }

  private boolean ruleExists(UUID workspaceId, String ruleCode) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM rule_def WHERE workspace_id = ? AND rule_code = ?)",
            Boolean.class,
            workspaceId,
            ruleCode));
  }

  private static TemplateRule templateRule(ResultSet result) throws SQLException {
    return new TemplateRule(
        result.getString("rule_code"),
        result.getString("object_type_code"),
        result.getString("field_code"),
        result.getString("severity"),
        result.getString("when_src"),
        result.getString("message"),
        result.getString("impact_json"),
        result.getString("suggest"),
        result.getString("fix_json"),
        result.getBoolean("lightweight"),
        result.getBoolean("published"),
        result.getLong("version"),
        result.getString("created_by"),
        result.getString("updated_by"));
  }

  private record ScopeIds(UUID objectTypeId, UUID fieldDefId) {}

  private record TemplateRule(
      String ruleCode,
      String objectTypeCode,
      String fieldCode,
      String severity,
      String whenSrc,
      String message,
      String impactJson,
      String suggest,
      String fixJson,
      boolean lightweight,
      boolean published,
      long version,
      String createdBy,
      String updatedBy) {}
}
