package com.mnext.engines.review;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class AnnotationRepository {
  private final JdbcTemplate jdbc;

  AnnotationRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  void insert(CreateAnnotationCommand command, UUID id, String actorId, Instant now) {
    jdbc.update(
        """
        INSERT INTO annotation
          (id, workspace_id, round_id, target_type, target_id, field_code,
           anchored_data_version, severity, body, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
        """,
        id,
        command.workspaceId(),
        command.roundId(),
        command.targetType(),
        command.targetId(),
        command.fieldCode(),
        command.anchoredDataVersion(),
        command.severity(),
        command.body(),
        actorId,
        Timestamp.from(now));
  }

  Optional<AnnotationView> find(UUID workspaceId, UUID annotationId) {
    return jdbc.query(
        """
        SELECT id, workspace_id, round_id, target_type, target_id, field_code,
          anchored_data_version, severity, body, status, created_by, created_at,
          resolved_by, resolved_at
        FROM annotation WHERE workspace_id = ? AND id = ?
        """,
        result -> result.next() ? Optional.of(map(result)) : Optional.empty(),
        workspaceId,
        annotationId);
  }

  List<AnnotationView> findByTarget(
      UUID workspaceId, String targetType, UUID targetId, String fieldCode) {
    return jdbc.query(
        """
        SELECT id, workspace_id, round_id, target_type, target_id, field_code,
          anchored_data_version, severity, body, status, created_by, created_at,
          resolved_by, resolved_at
        FROM annotation
        WHERE workspace_id = ? AND target_type = ? AND target_id = ?
          AND field_code IS NOT DISTINCT FROM ?
        ORDER BY created_at, id
        """,
        (result, ignored) -> map(result),
        workspaceId,
        targetType,
        targetId,
        fieldCode);
  }

  void resolve(UUID workspaceId, UUID annotationId, String actorId, Instant now) {
    jdbc.update(
        """
        UPDATE annotation SET status = 'resolved', resolved_by = ?, resolved_at = ?
        WHERE workspace_id = ? AND id = ?
        """,
        actorId,
        Timestamp.from(now),
        workspaceId,
        annotationId);
  }

  void reopen(UUID workspaceId, UUID annotationId) {
    jdbc.update(
        """
        UPDATE annotation SET status = 'open', resolved_by = NULL, resolved_at = NULL
        WHERE workspace_id = ? AND id = ?
        """,
        workspaceId,
        annotationId);
  }

  private static AnnotationView map(java.sql.ResultSet result) throws java.sql.SQLException {
    var resolvedAt = result.getTimestamp("resolved_at");
    return new AnnotationView(
        result.getObject("id", UUID.class),
        result.getObject("workspace_id", UUID.class),
        result.getObject("round_id", UUID.class),
        result.getString("target_type"),
        result.getObject("target_id", UUID.class),
        result.getString("field_code"),
        result.getLong("anchored_data_version"),
        result.getString("severity"),
        result.getString("body"),
        result.getString("status"),
        result.getString("created_by"),
        result.getTimestamp("created_at").toInstant(),
        result.getString("resolved_by"),
        resolvedAt == null ? null : resolvedAt.toInstant());
  }
}
