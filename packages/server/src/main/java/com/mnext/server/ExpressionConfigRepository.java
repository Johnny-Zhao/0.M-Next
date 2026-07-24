package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Repository;

@Repository
class ExpressionConfigRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  ExpressionConfigRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  boolean workspaceExists(UUID workspaceId) {
    var count =
        jdbc.queryForObject(
            "SELECT count(*) FROM workspace WHERE id = ?", Integer.class, workspaceId);
    return count != null && count > 0;
  }

  boolean nameExists(UUID workspaceId, String name) {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM workspace_expression_config
            WHERE workspace_id = ? AND lower(btrim(name)) = lower(btrim(?))
            """,
            Integer.class,
            workspaceId,
            name);
    return count != null && count > 0;
  }

  void insertExpression(
      UUID workspaceId,
      String expressionId,
      String name,
      String space,
      String defaultViewId,
      String defaultForm,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO workspace_expression_config (
          workspace_id, expression_id, name, space, default_view_id, default_form,
          version, created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        """,
        workspaceId,
        expressionId,
        name,
        space,
        defaultViewId,
        defaultForm,
        actor,
        Timestamp.from(now),
        actor,
        Timestamp.from(now));
  }

  void insertView(
      UUID workspaceId,
      String viewId,
      String expressionId,
      String kind,
      String config,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO workspace_view_config (
          workspace_id, view_id, expression_id, kind, config, version,
          created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?::jsonb, 1, ?, ?, ?, ?)
        """,
        workspaceId,
        viewId,
        expressionId,
        kind,
        config,
        actor,
        Timestamp.from(now),
        actor,
        Timestamp.from(now));
  }

  List<ExpressionConfig> list(UUID workspaceId) {
    return jdbc.query(
        """
        SELECT e.expression_id, e.name, e.space, e.default_view_id, e.default_form,
               e.version, e.created_by, e.created_at, e.updated_by, e.updated_at,
               v.view_id, v.kind, v.config, v.version, v.created_by, v.created_at,
               v.updated_by, v.updated_at
        FROM workspace_expression_config e
        JOIN workspace_view_config v
          ON v.workspace_id = e.workspace_id AND v.expression_id = e.expression_id
        WHERE e.workspace_id = ?
        ORDER BY e.created_at, e.expression_id, v.created_at, v.view_id
        """,
        (ResultSetExtractor<List<ExpressionConfig>>) this::mapConfigs,
        workspaceId);
  }

  private List<ExpressionConfig> mapConfigs(ResultSet rows) throws SQLException {
    Map<String, MutableExpression> configs = new LinkedHashMap<>();
    while (rows.next()) {
      var expressionId = rows.getString("expression_id");
      var expression = configs.get(expressionId);
      if (expression == null) {
        expression =
            new MutableExpression(
                expressionId,
                rows.getString("name"),
                rows.getString("space"),
                rows.getString("default_view_id"),
                rows.getString("default_form"),
                rows.getLong(6),
                rows.getString(7),
                rows.getTimestamp(8).toInstant(),
                rows.getString(9),
                rows.getTimestamp(10).toInstant());
        configs.put(expressionId, expression);
      }
      expression.views.add(
          new ExpressionViewConfig(
              rows.getString("view_id"),
              expressionId,
              rows.getString("kind"),
              json(rows.getString("config")),
              rows.getLong(14),
              rows.getString(15),
              rows.getTimestamp(16).toInstant(),
              rows.getString(17),
              rows.getTimestamp(18).toInstant()));
    }
    return configs.values().stream().map(MutableExpression::freeze).toList();
  }

  private com.fasterxml.jackson.databind.JsonNode json(String value) throws SQLException {
    try {
      return mapper.readTree(value);
    } catch (JsonProcessingException failure) {
      throw new SQLException("Invalid stored expression view config", failure);
    }
  }

  private static final class MutableExpression {
    private final String expressionId;
    private final String name;
    private final String space;
    private final String defaultViewId;
    private final String defaultForm;
    private final long version;
    private final String createdBy;
    private final Instant createdAt;
    private final String updatedBy;
    private final Instant updatedAt;
    private final List<ExpressionViewConfig> views = new ArrayList<>();

    private MutableExpression(
        String expressionId,
        String name,
        String space,
        String defaultViewId,
        String defaultForm,
        long version,
        String createdBy,
        Instant createdAt,
        String updatedBy,
        Instant updatedAt) {
      this.expressionId = expressionId;
      this.name = name;
      this.space = space;
      this.defaultViewId = defaultViewId;
      this.defaultForm = defaultForm;
      this.version = version;
      this.createdBy = createdBy;
      this.createdAt = createdAt;
      this.updatedBy = updatedBy;
      this.updatedAt = updatedAt;
    }

    private ExpressionConfig freeze() {
      return new ExpressionConfig(
          expressionId,
          name,
          space,
          defaultViewId,
          defaultForm,
          version,
          createdBy,
          createdAt,
          updatedBy,
          updatedAt,
          List.copyOf(views));
    }
  }
}
