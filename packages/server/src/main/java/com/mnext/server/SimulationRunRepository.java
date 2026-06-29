package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class SimulationRunRepository {
  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final SnapshotRepository snapshots;
  private final SimulationEngineBridge engines;
  private final SimResultSeriesRepository series;

  SimulationRunRepository(
      JdbcTemplate jdbc,
      ObjectMapper mapper,
      SnapshotRepository snapshots,
      SimulationEngineBridge engines,
      SimResultSeriesRepository series) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.snapshots = snapshots;
    this.engines = engines;
    this.series = series;
  }

  SimulationRunView create(UUID workspaceId, SimulationCreateRequest request, String actor) {
    if (request == null || request.snapshotId() == null)
      throw new IllegalArgumentException("snapshotId 必填");
    if (request.workspaceId() != null) throw new IllegalArgumentException("仿真运行只接受 snapshotId");
    if (request.engineId() == null || request.engineId().isBlank())
      throw new IllegalArgumentException("engineId 必填");
    snapshot(workspaceId, request.snapshotId());
    requireEngine(request.engineId());
    var id = UUID.randomUUID();
    var queuedAt = Instant.now();
    var config = sorted(request.config() == null ? Map.of() : request.config());
    var configJson = json(config);
    jdbc.update(
        """
        INSERT INTO simulation_run
          (run_id, workspace_id, snapshot_id, engine_id, status, config, config_hash,
           queued_at, created_by)
        VALUES (?, ?, ?, ?, 'QUEUED', CAST(? AS jsonb), ?, ?, ?)
        """,
        id,
        workspaceId,
        request.snapshotId(),
        request.engineId(),
        configJson,
        hash(configJson),
        java.sql.Timestamp.from(queuedAt),
        actor);
    return get(workspaceId, id);
  }

  SnapshotDetail snapshot(UUID workspaceId, UUID snapshotId) {
    try {
      return snapshots.get(workspaceId, snapshotId);
    } catch (IllegalArgumentException failure) {
      throw new SimulationException(
          "SIM-404-SNAPSHOT-NOT-FOUND", "输入快照不存在或不可见", "重新选择当前工作空间内的 snapshotId");
    }
  }

  SimulationEngineBridge engines() {
    return engines;
  }

  SimulationRunView get(UUID workspaceId, UUID runId) {
    var detail =
        jdbc.query(
            """
            SELECT run_id, snapshot_id, engine_id, status, config::text, result::text,
                   result_hash, config_hash, queued_at, started_at, completed_at,
                   created_by, failure_reason
            FROM simulation_run WHERE workspace_id = ? AND run_id = ?
            """,
            result -> result.next() ? view(result) : null,
            workspaceId,
            runId);
    if (detail == null) throw new IllegalArgumentException("仿真运行不存在或不可见");
    return detail;
  }

  PageView<SimulationRunView> list(UUID workspaceId, int page, int size) {
    var total =
        jdbc.queryForObject(
            "SELECT count(*) FROM simulation_run WHERE workspace_id = ?", Long.class, workspaceId);
    var items =
        jdbc.query(
            """
            SELECT run_id, snapshot_id, engine_id, status, config::text, result::text,
                   result_hash, config_hash, queued_at, started_at, completed_at,
                   created_by, failure_reason
            FROM simulation_run WHERE workspace_id = ?
            ORDER BY queued_at DESC, run_id LIMIT ? OFFSET ?
            """,
            (row, index) -> view(row),
            workspaceId,
            size,
            page * size);
    return new PageView<>(items, page, size, total);
  }

  PageView<SimRunSummaryView> listSummaries(UUID workspaceId, int page, int size) {
    var total =
        jdbc.queryForObject(
            "SELECT count(*) FROM simulation_run WHERE workspace_id = ?", Long.class, workspaceId);
    var items =
        jdbc.query(
            """
            SELECT run_id, snapshot_id, engine_id, status, queued_at, started_at,
                   completed_at, result_hash, created_by
            FROM simulation_run WHERE workspace_id = ?
            ORDER BY queued_at DESC, run_id LIMIT ? OFFSET ?
            """,
            (row, index) ->
                new SimRunSummaryView(
                    row.getObject(1, UUID.class),
                    row.getObject(2, UUID.class),
                    row.getString(3),
                    row.getString(4),
                    row.getTimestamp(5).toInstant(),
                    row.getTimestamp(6) == null ? null : row.getTimestamp(6).toInstant(),
                    row.getTimestamp(7) == null ? null : row.getTimestamp(7).toInstant(),
                    row.getString(8),
                    row.getString(9)),
            workspaceId,
            size,
            page * size);
    return new PageView<>(items, page, size, total);
  }

  Optional<Map<String, Object>> latestCompletedResult(UUID workspaceId, String engineId) {
    var result =
        jdbc.query(
            """
            SELECT result::text
            FROM simulation_run
            WHERE workspace_id = ? AND engine_id = ? AND status = 'COMPLETED'
            ORDER BY completed_at DESC, run_id
            LIMIT 1
            """,
            rows -> rows.next() ? map(rows.getString(1)) : null,
            workspaceId,
            engineId);
    return Optional.ofNullable(result);
  }

  List<UUID> queuedRunIds() {
    return jdbc.query(
        "SELECT run_id FROM simulation_run WHERE status = 'QUEUED' ORDER BY queued_at, run_id",
        (row, index) -> row.getObject(1, UUID.class));
  }

  UUID workspaceId(UUID runId) {
    var values =
        jdbc.query(
            "SELECT workspace_id FROM simulation_run WHERE run_id = ?",
            (row, index) -> row.getObject(1, UUID.class),
            runId);
    if (values.isEmpty()) throw new IllegalArgumentException("仿真运行不存在");
    return values.getFirst();
  }

  void start(UUID runId) {
    var count =
        jdbc.update(
            """
            UPDATE simulation_run SET status = 'RUNNING', started_at = ?
            WHERE run_id = ? AND status = 'QUEUED'
            """,
            java.sql.Timestamp.from(Instant.now()),
            runId);
    if (count != 1) invalidTransition(runId);
  }

  void complete(UUID runId, Map<String, Object> result) {
    var resultJson = json(sorted(result));
    var count =
        jdbc.update(
            """
            UPDATE simulation_run
            SET status = 'COMPLETED', completed_at = ?, result = CAST(? AS jsonb),
                result_hash = ?, failure_reason = NULL
            WHERE run_id = ? AND status = 'RUNNING'
            """,
            java.sql.Timestamp.from(Instant.now()),
            resultJson,
            hash(resultJson),
            runId);
    if (count != 1) invalidTransition(runId);
    var workspaceId = workspaceId(runId);
    series.replace(workspaceId, runId, result);
  }

  void fail(UUID runId, String reason) {
    var count =
        jdbc.update(
            """
            UPDATE simulation_run
            SET status = 'FAILED', completed_at = ?, failure_reason = ?
            WHERE run_id = ? AND status = 'RUNNING'
            """,
            java.sql.Timestamp.from(Instant.now()),
            reason,
            runId);
    if (count != 1) invalidTransition(runId);
  }

  private void requireEngine(String engineId) {
    try {
      engines.require(engineId);
    } catch (IllegalArgumentException failure) {
      throw new SimulationException("SIM-422-ENGINE-NOT-FOUND", "未注册仿真引擎", "检查 engineId 或安装对应仿真插件");
    }
  }

  private void invalidTransition(UUID runId) {
    throw new SimulationException(
        "SIM-409-INVALID-STATE-TRANSITION", "仿真运行状态不允许该迁移", "刷新运行状态后重试或新建一次运行");
  }

  private Map<String, Object> sorted(Map<String, Object> value) {
    if (value == null) return Map.of();
    var result = new TreeMap<String, Object>();
    value.forEach((key, item) -> result.put(key, sortedValue(item)));
    return Collections.unmodifiableMap(result);
  }

  private Object sortedValue(Object value) {
    if (value instanceof Map<?, ?> nested) {
      var result = new TreeMap<String, Object>();
      nested.forEach((key, item) -> result.put(String.valueOf(key), sortedValue(item)));
      return Collections.unmodifiableMap(result);
    }
    if (value instanceof List<?> values) return values.stream().map(this::sortedValue).toList();
    return value;
  }

  private SimulationRunView view(java.sql.ResultSet row) throws java.sql.SQLException {
    return new SimulationRunView(
        row.getObject(1, UUID.class),
        row.getObject(2, UUID.class),
        row.getString(3),
        row.getString(4),
        map(row.getString(5)),
        map(row.getString(6)),
        row.getString(7),
        row.getString(8),
        row.getTimestamp(9).toInstant(),
        row.getTimestamp(10) == null ? null : row.getTimestamp(10).toInstant(),
        row.getTimestamp(11) == null ? null : row.getTimestamp(11).toInstant(),
        row.getString(12),
        row.getString(13));
  }

  private Map<String, Object> map(String value) {
    if (value == null) return null;
    try {
      return mapper.readValue(value, MAP_TYPE);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("仿真 JSON 无法解析", failure);
    }
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("仿真 JSON 无法序列化", failure);
    }
  }

  private static String hash(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }
}
