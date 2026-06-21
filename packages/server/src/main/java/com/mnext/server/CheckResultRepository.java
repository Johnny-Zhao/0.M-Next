package com.mnext.server;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class CheckResultRepository {
  private final JdbcTemplate jdbc;

  CheckResultRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  void insert(
      UUID workspaceId,
      UUID runId,
      String ruleCode,
      String severity,
      String message,
      UUID objectId,
      String fieldCode,
      String configHash,
      Instant createdAt) {
    jdbc.update(
        """
        INSERT INTO check_result
          (id, workspace_id, run_id, rule_code, severity, message,
           object_id, field_code, config_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        UUID.randomUUID(),
        workspaceId,
        runId,
        ruleCode,
        severity,
        message,
        objectId,
        fieldCode,
        configHash,
        Timestamp.from(createdAt));
  }

  PageView<CheckResultView> find(UUID workspaceId, UUID runId, int page, int size) {
    var total =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM check_result
            WHERE workspace_id = ? AND run_id = ?
            """,
            Long.class,
            workspaceId,
            runId);
    var items =
        jdbc.query(
            """
            SELECT run_id, rule_code, severity, message, object_id,
                   field_code, config_hash, created_at
            FROM check_result
            WHERE workspace_id = ? AND run_id = ?
            ORDER BY created_at, id
            LIMIT ? OFFSET ?
            """,
            (row, ignored) ->
                new CheckResultView(
                    row.getObject(1, UUID.class),
                    row.getString(2),
                    row.getString(3),
                    row.getString(4),
                    row.getObject(5, UUID.class),
                    row.getString(6),
                    row.getString(7),
                    row.getTimestamp(8).toInstant()),
            workspaceId,
            runId,
            size,
            page * size);
    return new PageView<>(items, page, size, total);
  }

  List<CheckResultView> findAll(UUID workspaceId, UUID runId) {
    return find(workspaceId, runId, 0, 200).items();
  }

  Optional<UUID> latestRunId(UUID workspaceId) {
    var runId =
        jdbc.query(
            """
            SELECT result_snapshot->'events'->>0
            FROM command_log
            WHERE workspace_id = ?
              AND command_type = 'RunRuleCheck'
              AND result_snapshot->>'status' IN ('ACCEPTED', 'COMMITTED', 'COMPLETED')
            ORDER BY decided_at DESC, command_id
            LIMIT 1
            """,
            rows -> rows.next() ? rows.getString(1) : null,
            workspaceId);
    return runId == null || runId.isBlank()
        ? Optional.empty()
        : Optional.of(UUID.fromString(runId));
  }

  boolean runExists(UUID workspaceId, UUID runId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS (
              SELECT 1
              FROM command_log
              WHERE workspace_id = ?
                AND command_type = 'RunRuleCheck'
                AND result_snapshot->'events'->>0 = ?
            ) OR EXISTS (
              SELECT 1
              FROM check_result
              WHERE workspace_id = ? AND run_id = ?
            )
            """,
            Boolean.class,
            workspaceId,
            runId.toString(),
            workspaceId,
            runId));
  }

  List<CheckResultView> findForObjects(UUID workspaceId, UUID runId, List<UUID> objectIds) {
    if (objectIds.isEmpty()) return List.of();
    var placeholders = String.join(", ", Collections.nCopies(objectIds.size(), "?"));
    var args = new ArrayList<Object>();
    args.add(workspaceId);
    args.add(runId);
    args.addAll(objectIds);
    return jdbc.query(
        """
        SELECT run_id, rule_code, severity, message, object_id,
               field_code, config_hash, created_at
        FROM check_result
        WHERE workspace_id = ?
          AND run_id = ?
          AND severity IN ('BLOCK', 'WARN')
          AND object_id IN (
        """
            + placeholders
            + """
          )
        ORDER BY object_id, severity, rule_code, created_at, id
        """,
        (row, ignored) ->
            new CheckResultView(
                row.getObject(1, UUID.class),
                row.getString(2),
                row.getString(3),
                row.getString(4),
                row.getObject(5, UUID.class),
                row.getString(6),
                row.getString(7),
                row.getTimestamp(8).toInstant()),
        args.toArray());
  }
}
