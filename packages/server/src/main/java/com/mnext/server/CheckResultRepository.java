package com.mnext.server;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

  void completeRun(UUID workspaceId, UUID runId, String scopeObjectTypeCode, Instant completedAt) {
    jdbc.update(
        """
        INSERT INTO check_run
          (run_id, workspace_id, scope_object_type_code, status, started_at, completed_at)
        VALUES (?, ?, ?, 'COMPLETED', ?, ?)
        """,
        runId,
        workspaceId,
        scopeObjectTypeCode,
        Timestamp.from(completedAt),
        Timestamp.from(completedAt));
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

  Optional<LatestCheckRun> latestRun(UUID workspaceId) {
    var current =
        jdbc.query(
            """
            SELECT run_id, scope_object_type_code, status, completed_at
            FROM check_run
            WHERE workspace_id = ?
              AND status = 'COMPLETED'
            ORDER BY completed_at DESC NULLS LAST, run_id
            LIMIT 1
            """,
            rows ->
                rows.next()
                    ? new LatestCheckRun(
                        rows.getObject(1, UUID.class),
                        rows.getString(2),
                        rows.getString(3),
                        rows.getTimestamp(4).toInstant())
                    : null,
            workspaceId);
    if (current != null) return Optional.of(current);
    var legacy =
        jdbc.query(
            """
            SELECT result_snapshot->'events'->>0, decided_at
            FROM command_log
            WHERE workspace_id = ?
              AND command_type = 'RunRuleCheck'
              AND result_snapshot->>'status' IN ('ACCEPTED', 'COMMITTED', 'COMPLETED')
            ORDER BY decided_at DESC, command_id
            LIMIT 1
            """,
            rows ->
                rows.next()
                    ? new LatestCheckRun(
                        UUID.fromString(rows.getString(1)),
                        null,
                        "COMPLETED",
                        rows.getTimestamp(2).toInstant())
                    : null,
            workspaceId);
    return Optional.ofNullable(legacy);
  }

  Optional<UUID> latestRunId(UUID workspaceId) {
    return latestRun(workspaceId).map(LatestCheckRun::runId);
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
            ) OR EXISTS (
              SELECT 1
              FROM check_run
              WHERE workspace_id = ? AND run_id = ?
            )
            """,
            Boolean.class,
            workspaceId,
            runId.toString(),
            workspaceId,
            runId,
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

  Map<UUID, String> latestRuleStatuses(UUID workspaceId, List<UUID> objectIds) {
    if (objectIds.isEmpty()) return Map.of();
    if (objectIds.size() > 200) throw new IllegalArgumentException("objectIds 最多 200 个");
    var statuses = new LinkedHashMap<UUID, String>();
    objectIds.forEach(objectId -> statuses.putIfAbsent(objectId, "OK"));
    // Legacy workbench and recommendation consumers use only a completed full-workspace run.
    // UniSource reads an explicitly selected run and does not consume these per-object badges.
    var runId =
        jdbc.query(
            """
            SELECT run_id
            FROM check_run
            WHERE workspace_id = ?
              AND status = 'COMPLETED'
              AND scope_object_type_code IS NULL
            ORDER BY completed_at DESC NULLS LAST, run_id
            LIMIT 1
            """,
            rows -> rows.next() ? rows.getObject(1, UUID.class) : null,
            workspaceId);
    if (runId == null) {
      statuses.replaceAll((ignored, status) -> "UNKNOWN");
      return statuses;
    }
    var placeholders = String.join(", ", Collections.nCopies(statuses.size(), "?"));
    var args = new ArrayList<Object>();
    args.add(workspaceId);
    args.addAll(statuses.keySet());
    args.add(runId);
    jdbc.query(
        """
        SELECT object_id,
               CASE max(CASE severity WHEN 'BLOCK' THEN 2 WHEN 'WARN' THEN 1 ELSE 0 END)
                 WHEN 2 THEN 'BLOCK'
                 WHEN 1 THEN 'WARN'
                 ELSE 'OK'
               END
        FROM check_result
        WHERE workspace_id = ?
          AND object_id IN (
        """
            + placeholders
            + """
          )
          AND run_id = ?
        GROUP BY object_id
        """,
        rows -> {
          statuses.put(rows.getObject(1, UUID.class), rows.getString(2));
        },
        args.toArray());
    return statuses;
  }
}

record LatestCheckRun(UUID runId, String scopeObjectTypeCode, String status, Instant completedAt) {}
