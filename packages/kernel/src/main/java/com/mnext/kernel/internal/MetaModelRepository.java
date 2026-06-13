package com.mnext.kernel.internal;

import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class MetaModelRepository {
  private final JdbcTemplate jdbc;

  MetaModelRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  Optional<String> templateVersionStatus(UUID templateVersionId) {
    if (templateVersionId == null) return Optional.empty();
    return jdbc.query(
        "SELECT status FROM scene_template_version WHERE id = ?",
        result -> result.next() ? Optional.of(result.getString(1)) : Optional.empty(),
        templateVersionId);
  }

  boolean objectTypeExists(UUID workspaceId, UUID objectTypeId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM object_type WHERE workspace_id = ? AND id = ?)",
            Boolean.class,
            workspaceId,
            objectTypeId));
  }

  boolean objectTypeCodeExists(UUID workspaceId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM object_type WHERE workspace_id = ? AND code = ?)",
            Boolean.class,
            workspaceId,
            code));
  }

  Optional<UUID> objectTypeTemplateVersion(UUID workspaceId, UUID objectTypeId) {
    return jdbc.query(
        """
        SELECT template_version_id FROM object_type
        WHERE workspace_id = ? AND id = ?
        """,
        result -> result.next() ? Optional.ofNullable(result.getObject(1, UUID.class)) : null,
        workspaceId,
        objectTypeId);
  }

  boolean fieldCodeExists(UUID objectTypeId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM field_def WHERE object_type_id = ? AND code = ?)",
            Boolean.class,
            objectTypeId,
            code));
  }

  boolean relationTypeCodeExists(UUID workspaceId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM relation_type WHERE workspace_id = ? AND code = ?)",
            Boolean.class,
            workspaceId,
            code));
  }

  void insertObjectType(
      UUID id,
      UUID workspaceId,
      UUID templateVersionId,
      String code,
      String name,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, template_version_id, code, name, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?)
        """,
        id,
        workspaceId,
        templateVersionId,
        code,
        name,
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
  }

  void insertFieldDef(
      UUID id,
      UUID objectTypeId,
      UUID templateVersionId,
      String code,
      String name,
      DataType dataType,
      boolean required,
      FieldConstraints constraints,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, template_version_id, code, name, required, data_type, constraints,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?)
        """,
        id,
        objectTypeId,
        templateVersionId,
        code,
        name,
        required,
        dataType.code(),
        JsonCodec.encode(constraints.asMap()),
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
  }

  void insertRelationType(
      UUID id,
      UUID workspaceId,
      UUID templateVersionId,
      String code,
      UUID sourceTypeId,
      UUID targetTypeId,
      String direction,
      String cardinality,
      String semantics,
      boolean hierarchical,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO relation_type
          (id, workspace_id, template_version_id, code, source_type, target_type, direction,
           cardinality, semantics, hierarchical, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        id,
        workspaceId,
        templateVersionId,
        code,
        sourceTypeId,
        targetTypeId,
        direction,
        cardinality,
        semantics,
        hierarchical,
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
  }
}
