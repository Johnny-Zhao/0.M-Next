package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class SimResultSeriesRepository {
  private static final int MAX_PAGE_SIZE = 500;
  private static final int MAX_DOWNSAMPLE = 1000;
  private static final long MAX_RAW_ROWS = 100_000L;
  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  SimResultSeriesRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  void replace(UUID workspaceId, UUID runId, Map<String, Object> result) {
    jdbc.update("DELETE FROM sim_result_series WHERE run_id = ?", runId);
    var points = extract(workspaceId, runId, result);
    if (points.isEmpty()) return;
    jdbc.batchUpdate(
        """
        INSERT INTO sim_result_series
          (run_id, workspace_id, object_id, field_code, t, value, value_json)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb))
        """,
        new BatchPreparedStatementSetter() {
          @Override
          public void setValues(PreparedStatement statement, int index) throws SQLException {
            var point = points.get(index);
            statement.setObject(1, point.runId());
            statement.setObject(2, point.workspaceId());
            statement.setObject(3, point.objectId());
            statement.setString(4, point.fieldCode());
            statement.setDouble(5, point.t());
            if (point.value() == null) {
              statement.setNull(6, Types.DOUBLE);
            } else {
              statement.setDouble(6, point.value());
            }
            statement.setString(7, point.valueJson());
          }

          @Override
          public int getBatchSize() {
            return points.size();
          }
        });
  }

  PageView<SimResultSeriesPointView> find(
      UUID workspaceId,
      UUID runId,
      UUID objectId,
      String fieldCode,
      Double from,
      Double to,
      int downsample,
      int page,
      int size) {
    requireRun(workspaceId, runId);
    if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..500");
    }
    if (downsample < 1 || downsample > MAX_DOWNSAMPLE) {
      throw new IllegalArgumentException("downsample 必须为 1..1000");
    }
    var filter = filter(workspaceId, runId, objectId, fieldCode, from, to);
    var rawTotal = count(filter);
    if (rawTotal > MAX_RAW_ROWS) {
      throw new IllegalArgumentException("序列查询超过 100000 行，请收窄对象、字段或时间窗");
    }
    var sampledTotal = (rawTotal + downsample - 1) / downsample;
    var params = new ArrayList<>(filter.params());
    params.add(downsample);
    params.add(size);
    params.add(page * size);
    var items =
        jdbc.query(
            """
            WITH filtered AS (
              SELECT object_id, field_code, t, value, value_json::text,
                     row_number() OVER (ORDER BY t, object_id, field_code) AS rn
              FROM sim_result_series
            """
                + filter.where()
                + """
            ),
            sampled AS (
              SELECT object_id, field_code, t, value, value_json
              FROM filtered
              WHERE ((rn - 1) % ?) = 0
            )
            SELECT object_id, field_code, t, value, value_json
            FROM sampled
            ORDER BY t, object_id, field_code
            LIMIT ? OFFSET ?
            """,
            (row, index) ->
                new SimResultSeriesPointView(
                    row.getObject(1, UUID.class),
                    row.getString(2),
                    row.getDouble(3),
                    row.getObject(4) == null ? null : row.getDouble(4),
                    jsonValue(row.getString(5))),
            params.toArray());
    return new PageView<>(items, page, size, sampledTotal);
  }

  private List<SeriesPoint> extract(UUID workspaceId, UUID runId, Map<String, Object> result) {
    if (result == null || result.isEmpty()) return List.of();
    var points = new ArrayList<SeriesPoint>();
    collectSeries(points, workspaceId, runId, result.get("series"));
    for (var entry : result.entrySet()) {
      if (entry.getKey().endsWith("Curve")) {
        collectSeries(points, workspaceId, runId, entry.getValue());
      }
    }
    return List.copyOf(points);
  }

  private void collectSeries(
      List<SeriesPoint> points, UUID workspaceId, UUID runId, Object candidate) {
    if (!(candidate instanceof List<?> values)) return;
    for (var value : values) {
      if (value instanceof Map<?, ?> point) {
        addPoint(points, workspaceId, runId, point);
      }
    }
  }

  private void addPoint(List<SeriesPoint> points, UUID workspaceId, UUID runId, Map<?, ?> point) {
    var objectId = uuid(first(point, "objectId", "object_id", "object"));
    var fieldCode = text(first(point, "fieldCode", "field_code", "field"));
    var time = number(first(point, "t", "time", "minute"));
    if (objectId == null || fieldCode == null || time == null || fieldCode.length() > 128) return;
    var rawValue = first(point, "value", "valueJson", "value_json");
    if (rawValue == null) return;
    var numericValue = number(rawValue);
    points.add(
        new SeriesPoint(
            runId,
            workspaceId,
            objectId,
            fieldCode,
            time,
            numericValue,
            numericValue == null ? json(rawValue) : null));
  }

  private void requireRun(UUID workspaceId, UUID runId) {
    var count =
        jdbc.queryForObject(
            "SELECT count(*) FROM simulation_run WHERE workspace_id = ? AND run_id = ?",
            Long.class,
            workspaceId,
            runId);
    if (count == null || count == 0L) throw new IllegalArgumentException("仿真运行不存在或不可见");
  }

  private long count(QueryFilter filter) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM sim_result_series" + filter.where(),
        Long.class,
        filter.params().toArray());
  }

  private QueryFilter filter(
      UUID workspaceId, UUID runId, UUID objectId, String fieldCode, Double from, Double to) {
    var where = new StringBuilder(" WHERE workspace_id = ? AND run_id = ?");
    var params = new ArrayList<Object>();
    params.add(workspaceId);
    params.add(runId);
    if (objectId != null) {
      where.append(" AND object_id = ?");
      params.add(objectId);
    }
    if (fieldCode != null && !fieldCode.isBlank()) {
      where.append(" AND field_code = ?");
      params.add(fieldCode);
    }
    if (from != null) {
      where.append(" AND t >= ?");
      params.add(from);
    }
    if (to != null) {
      where.append(" AND t <= ?");
      params.add(to);
    }
    return new QueryFilter(where.toString(), params);
  }

  private Object jsonValue(String value) {
    if (value == null) return null;
    try {
      return mapper.readValue(value, MAP_TYPE);
    } catch (JsonProcessingException ignored) {
      try {
        return mapper.readValue(value, Object.class);
      } catch (JsonProcessingException failure) {
        return null;
      }
    }
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      return null;
    }
  }

  private static Object first(Map<?, ?> values, String... keys) {
    for (var key : keys) {
      if (values.containsKey(key)) return values.get(key);
    }
    return null;
  }

  private static UUID uuid(Object value) {
    if (value instanceof UUID id) return id;
    if (!(value instanceof String text) || text.isBlank()) return null;
    try {
      return UUID.fromString(text);
    } catch (IllegalArgumentException ignored) {
      return null;
    }
  }

  private static String text(Object value) {
    return value instanceof String text && !text.isBlank() ? text : null;
  }

  private static Double number(Object value) {
    if (value instanceof Number number) return finite(number.doubleValue());
    if (value instanceof String text && !text.isBlank()) {
      try {
        return finite(Double.parseDouble(text));
      } catch (NumberFormatException ignored) {
        return null;
      }
    }
    return null;
  }

  private static Double finite(double value) {
    return Double.isFinite(value) ? value : null;
  }

  private record QueryFilter(String where, List<Object> params) {}

  private record SeriesPoint(
      UUID runId,
      UUID workspaceId,
      UUID objectId,
      String fieldCode,
      double t,
      Double value,
      String valueJson) {}
}
