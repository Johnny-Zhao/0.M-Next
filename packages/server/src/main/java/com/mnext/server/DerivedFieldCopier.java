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
class DerivedFieldCopier {
  private final JdbcTemplate jdbc;

  DerivedFieldCopier(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  void copyForInstantiate(UUID templateVersionId, UUID newWorkspaceId) {
    for (var field : templateFields(templateVersionId)) {
      var objectTypeId = resolveObjectType(newWorkspaceId, field.objectTypeCode());
      if (!fieldExists(objectTypeId, field.code())) {
        copyField(field, newWorkspaceId, objectTypeId);
      }
    }
  }

  void copyNewFields(UUID toVersionId, UUID workspaceId) {
    for (var field : templateFields(toVersionId)) {
      var objectTypeId = resolveObjectType(workspaceId, field.objectTypeCode());
      if (!fieldExists(objectTypeId, field.code())) {
        copyField(field, workspaceId, objectTypeId);
      }
    }
  }

  void copyForApplyProfile(UUID templateVersionId, UUID workspaceId) {
    for (var field : templateFields(templateVersionId)) {
      var objectTypeId = resolveObjectType(workspaceId, templateVersionId, field.objectTypeCode());
      if (!fieldExists(objectTypeId, field.code())) {
        copyField(field, workspaceId, objectTypeId);
      }
    }
  }

  private void copyField(TemplateDerivedField field, UUID workspaceId, UUID objectTypeId) {
    var now = Timestamp.from(Instant.now());
    jdbc.update(
        """
        INSERT INTO derived_field
          (id, workspace_id, object_type_id, template_version_id, code, name, result_type,
           derivation, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        UUID.randomUUID(),
        workspaceId,
        objectTypeId,
        field.code(),
        field.name(),
        field.resultType(),
        field.derivation(),
        field.createdBy(),
        field.updatedBy(),
        now,
        now);
  }

  private List<TemplateDerivedField> templateFields(UUID templateVersionId) {
    return jdbc.query(
        """
        SELECT derived.code, derived.name, derived.result_type, derived.derivation,
               derived.created_by, derived.updated_by, type.code AS object_type_code
        FROM derived_field derived
        JOIN object_type type ON type.id = derived.object_type_id
        WHERE derived.template_version_id = ?
        ORDER BY type.code, derived.code
        """,
        (result, ignored) -> templateField(result),
        templateVersionId);
  }

  private UUID resolveObjectType(UUID workspaceId, String objectTypeCode) {
    return resolveObjectType(workspaceId, null, objectTypeCode);
  }

  private UUID resolveObjectType(UUID workspaceId, UUID templateVersionId, String objectTypeCode) {
    var ids =
        jdbc.query(
            """
            SELECT id FROM object_type
            WHERE workspace_id = ?
              AND template_version_id IS NOT DISTINCT FROM ?
              AND code = ?
            """,
            (row, ignored) -> row.getObject(1, UUID.class),
            workspaceId,
            templateVersionId,
            objectTypeCode);
    if (ids.isEmpty()) {
      throw new IllegalStateException("模板派生字段对象类型无法在目标空间解析");
    }
    return ids.getFirst();
  }

  private boolean fieldExists(UUID objectTypeId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM derived_field WHERE object_type_id = ? AND code = ?)",
            Boolean.class,
            objectTypeId,
            code));
  }

  private static TemplateDerivedField templateField(ResultSet result) throws SQLException {
    return new TemplateDerivedField(
        result.getString("code"),
        result.getString("name"),
        result.getString("result_type"),
        result.getString("derivation"),
        result.getString("created_by"),
        result.getString("updated_by"),
        result.getString("object_type_code"));
  }

  private record TemplateDerivedField(
      String code,
      String name,
      String resultType,
      String derivation,
      String createdBy,
      String updatedBy,
      String objectTypeCode) {}
}
