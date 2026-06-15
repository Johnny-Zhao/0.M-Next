package com.mnext.server;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class ReadModelRepository {
  private static final String GROUP = "readmodel";
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  ReadModelRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  boolean consumed(String eventId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM rm_consumed_event WHERE consumer_group = ? AND event_id = ?)",
            Boolean.class,
            GROUP,
            eventId));
  }

  void markConsumed(String eventId) {
    jdbc.update(
        "INSERT INTO rm_consumed_event (consumer_group, event_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
        GROUP,
        eventId);
  }

  String objectTypeCode(UUID workspaceId, UUID objectTypeId) {
    return jdbc.queryForObject(
        "SELECT code FROM object_type WHERE workspace_id = ? AND id = ?",
        String.class,
        workspaceId,
        objectTypeId);
  }

  RelationTypeProjection relationType(UUID workspaceId, UUID relationTypeId) {
    return jdbc.queryForObject(
        "SELECT code, hierarchical FROM relation_type WHERE workspace_id = ? AND id = ?",
        (row, index) -> new RelationTypeProjection(row.getString(1), row.getBoolean(2)),
        workspaceId,
        relationTypeId);
  }

  void createObject(
      UUID workspaceId,
      UUID objectId,
      String typeCode,
      String status,
      long version,
      Instant updatedAt) {
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, ?, ?, ?, '{}'::jsonb, ?)
        ON CONFLICT (workspace_id, object_id) DO NOTHING
        """,
        workspaceId,
        objectId,
        typeCode,
        status,
        version,
        java.sql.Timestamp.from(updatedAt));
  }

  void updateField(
      UUID workspaceId, UUID objectId, String code, Object value, long version, Instant updatedAt) {
    jdbc.update(
        """
        UPDATE rm_object SET fields = jsonb_set(fields, ARRAY[?], CAST(? AS jsonb), TRUE),
          version = ?, updated_at = ?
        WHERE workspace_id = ? AND object_id = ? AND version < ?
        """,
        code,
        json(value),
        version,
        java.sql.Timestamp.from(updatedAt),
        workspaceId,
        objectId,
        version);
  }

  void updateObjectStatus(
      UUID workspaceId, UUID objectId, String status, long version, Instant updatedAt) {
    jdbc.update(
        """
        UPDATE rm_object SET status = ?, version = ?, updated_at = ?
        WHERE workspace_id = ? AND object_id = ? AND version < ?
        """,
        status,
        version,
        java.sql.Timestamp.from(updatedAt),
        workspaceId,
        objectId,
        version);
  }

  void createRelation(
      UUID workspaceId,
      UUID relationId,
      String typeCode,
      UUID sourceId,
      UUID targetId,
      Map<String, Object> fields,
      boolean hierarchical,
      long version,
      Instant updatedAt) {
    jdbc.update(
        """
        INSERT INTO rm_relation
          (workspace_id, relation_id, relation_type_code, source_id, target_id, fields,
           hierarchical, status, version, updated_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?, 'ACTIVE', ?, ?)
        ON CONFLICT (workspace_id, relation_id) DO NOTHING
        """,
        workspaceId,
        relationId,
        typeCode,
        sourceId,
        targetId,
        json(fields),
        hierarchical,
        version,
        java.sql.Timestamp.from(updatedAt));
  }

  void updateRelation(
      UUID workspaceId,
      UUID relationId,
      UUID sourceId,
      UUID targetId,
      Map<String, Object> fields,
      long version,
      Instant updatedAt) {
    jdbc.update(
        """
        UPDATE rm_relation SET source_id = ?, target_id = ?, fields = CAST(? AS jsonb),
          version = ?, updated_at = ?
        WHERE workspace_id = ? AND relation_id = ? AND version < ?
        """,
        sourceId,
        targetId,
        json(fields),
        version,
        java.sql.Timestamp.from(updatedAt),
        workspaceId,
        relationId,
        version);
  }

  void updateRelationStatus(
      UUID workspaceId, UUID relationId, String status, long version, Instant updatedAt) {
    jdbc.update(
        """
        UPDATE rm_relation SET status = ?, version = ?, updated_at = ?
        WHERE workspace_id = ? AND relation_id = ? AND version < ?
        """,
        status,
        version,
        java.sql.Timestamp.from(updatedAt),
        workspaceId,
        relationId,
        version);
  }

  List<ObjectTypeView> objectTypes(UUID workspaceId) {
    return jdbc.query(
        """
        SELECT type.id, type.code, type.name, field.code, field.name, field.data_type,
               field.required, field.constraints::text
        FROM object_type type LEFT JOIN field_def field ON field.object_type_id = type.id
        WHERE type.workspace_id = ?
        ORDER BY type.code, field.code
        """,
        result -> {
          var types = new java.util.LinkedHashMap<UUID, ObjectTypeView>();
          while (result.next()) {
            var id = result.getObject(1, UUID.class);
            var type =
                types.computeIfAbsent(
                    id,
                    ignored ->
                        new ObjectTypeView(
                            id,
                            resultString(result, 2),
                            resultString(result, 3),
                            new java.util.ArrayList<>()));
            if (result.getString(4) != null) {
              type.fields()
                  .add(
                      new FieldDefinitionView(
                          result.getString(4),
                          result.getString(5),
                          result.getString(6),
                          result.getBoolean(7),
                          map(result.getString(8))));
            }
          }
          return List.copyOf(types.values());
        },
        workspaceId);
  }

  PageView<ObjectView> objects(UUID workspaceId, String objectType, int page, int pageSize) {
    var total =
        jdbc.queryForObject(
            "SELECT count(*) FROM rm_object WHERE workspace_id = ? AND object_type_code = ?",
            Long.class,
            workspaceId,
            objectType);
    var items =
        jdbc.query(
            """
            SELECT object_id, object_type_code, status, version, fields::text, updated_at
            FROM rm_object WHERE workspace_id = ? AND object_type_code = ?
            ORDER BY object_id LIMIT ? OFFSET ?
            """,
            (row, index) -> object(row),
            workspaceId,
            objectType,
            pageSize,
            page * pageSize);
    return new PageView<>(items, page, pageSize, total);
  }

  ObjectDetailView object(UUID workspaceId, UUID objectId) {
    var object =
        jdbc.query(
            """
            SELECT object_id, object_type_code, status, version, fields::text, updated_at
            FROM rm_object WHERE workspace_id = ? AND object_id = ?
            """,
            result -> result.next() ? object(result) : null,
            workspaceId,
            objectId);
    if (object == null) throw new IllegalArgumentException("对象不存在或不可见");
    var relations =
        jdbc.query(
            """
            SELECT relation_id, relation_type_code, source_id, target_id, fields::text,
                   hierarchical, status, version
            FROM rm_relation
            WHERE workspace_id = ? AND status = 'ACTIVE' AND (source_id = ? OR target_id = ?)
            ORDER BY relation_id LIMIT 200
            """,
            (row, index) -> relation(row),
            workspaceId,
            objectId,
            objectId);
    return new ObjectDetailView(object, relations);
  }

  List<RelationView> relations(
      UUID workspaceId, String relationType, String direction, UUID sourceId, int depth) {
    var endpoint = "out".equals(direction) ? "source_id" : "target_id";
    var next = "out".equals(direction) ? "target_id" : "source_id";
    var sql =
        """
        WITH RECURSIVE edges AS (
          SELECT relation.*, 1 AS depth, relation.%s AS next_id
          FROM rm_relation relation
          WHERE workspace_id = ? AND relation_type_code = ? AND %s = ? AND status = 'ACTIVE'
          UNION ALL
          SELECT relation.*, edges.depth + 1, relation.%s AS next_id
          FROM rm_relation relation JOIN edges ON relation.%s = edges.next_id
          WHERE relation.workspace_id = ? AND relation.relation_type_code = ?
            AND relation.status = 'ACTIVE' AND edges.depth < ?)
        SELECT DISTINCT relation_id, relation_type_code, source_id, target_id, fields::text,
               hierarchical, status, version
        FROM edges ORDER BY relation_id LIMIT 1000
        """
            .formatted(next, endpoint, next, endpoint);
    return jdbc.query(
        sql,
        (row, index) -> relation(row),
        workspaceId,
        relationType,
        sourceId,
        workspaceId,
        relationType,
        depth);
  }

  List<TreeNodeView> tree(UUID workspaceId, String relationType, UUID rootId) {
    return jdbc.query(
        """
        WITH RECURSIVE tree AS (
          SELECT source_id, target_id, 1 AS depth FROM rm_relation
          WHERE workspace_id = ? AND relation_type_code = ? AND source_id = ?
            AND hierarchical AND status = 'ACTIVE'
          UNION ALL
          SELECT relation.source_id, relation.target_id, tree.depth + 1
          FROM rm_relation relation JOIN tree ON relation.source_id = tree.target_id
          WHERE relation.workspace_id = ? AND relation.relation_type_code = ?
            AND relation.hierarchical AND relation.status = 'ACTIVE' AND tree.depth < 5)
        SELECT source_id, target_id, depth FROM tree ORDER BY depth, target_id
        """,
        (row, index) ->
            new TreeNodeView(
                row.getObject(1, UUID.class), row.getObject(2, UUID.class), row.getInt(3)),
        workspaceId,
        relationType,
        rootId,
        workspaceId,
        relationType);
  }

  MatrixView matrix(
      UUID workspaceId,
      String rowType,
      String colType,
      String relationType,
      int rowPage,
      int rowSize,
      int colPage,
      int colSize) {
    var rows = objects(workspaceId, rowType, rowPage, rowSize);
    var cols = objects(workspaceId, colType, colPage, colSize);
    var cells =
        jdbc.query(
            """
            SELECT relation.source_id, relation.target_id, relation.relation_id,
                   relation.status, relation.fields::text
            FROM rm_relation relation
            WHERE relation.workspace_id = ? AND relation.relation_type_code = ?
              AND relation.source_id IN (
                SELECT object_id FROM rm_object
                WHERE workspace_id = ? AND object_type_code = ?
                ORDER BY object_id LIMIT ? OFFSET ?)
              AND relation.target_id IN (
                SELECT object_id FROM rm_object
                WHERE workspace_id = ? AND object_type_code = ?
                ORDER BY object_id LIMIT ? OFFSET ?)
            ORDER BY relation.source_id, relation.target_id, relation.relation_id
            """,
            (row, index) ->
                new MatrixView.MatrixCell(
                    row.getObject(1, UUID.class),
                    row.getObject(2, UUID.class),
                    row.getObject(3, UUID.class),
                    row.getString(4),
                    map(row.getString(5))),
            workspaceId,
            relationType,
            workspaceId,
            rowType,
            rowSize,
            rowPage * rowSize,
            workspaceId,
            colType,
            colSize,
            colPage * colSize);
    return new MatrixView(
        rows.items().stream().map(this::matrixObject).toList(),
        cols.items().stream().map(this::matrixObject).toList(),
        cells,
        rows.total(),
        cols.total());
  }

  boolean hierarchicalRelationType(UUID workspaceId, String relationType) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS(SELECT 1 FROM relation_type
              WHERE workspace_id = ? AND code = ? AND hierarchical)
            """,
            Boolean.class,
            workspaceId,
            relationType));
  }

  SyncStatusView syncStatus(UUID workspaceId) {
    var pending =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM event_outbox
            WHERE payload->>'workspaceId' = ? AND status = 'PENDING'
            """,
            Long.class,
            workspaceId.toString());
    return new SyncStatusView(pending, pending == 0);
  }

  DataSet dataSet(UUID workspaceId) {
    var objects =
        jdbc.query(
            """
            SELECT object_id, object_type_code, fields::text, status, version
            FROM rm_object WHERE workspace_id = ? ORDER BY object_id
            """,
            (row, index) ->
                new DataObject(
                    row.getObject(1, UUID.class).toString(),
                    row.getString(2),
                    map(row.getString(3)),
                    row.getString(4),
                    row.getLong(5)),
            workspaceId);
    var relations =
        jdbc.query(
            """
            SELECT relation_id, relation_type_code, source_id, target_id, fields::text
            FROM rm_relation WHERE workspace_id = ? ORDER BY relation_id
            """,
            (row, index) ->
                new DataRelation(
                    row.getObject(1, UUID.class).toString(),
                    row.getString(2),
                    row.getObject(3, UUID.class).toString(),
                    row.getObject(4, UUID.class).toString(),
                    map(row.getString(5))),
            workspaceId);
    return new DataSet(objects, relations);
  }

  DataSet dataSet(UUID workspaceId, String scopeObjectType) {
    var objects =
        jdbc.query(
            """
            SELECT object_id, object_type_code, fields::text, status, version
            FROM rm_object
            WHERE workspace_id = ? AND object_type_code = ?
            ORDER BY object_id
            """,
            (row, index) ->
                new DataObject(
                    row.getObject(1, UUID.class).toString(),
                    row.getString(2),
                    map(row.getString(3)),
                    row.getString(4),
                    row.getLong(5)),
            workspaceId,
            scopeObjectType);
    var relations =
        jdbc.query(
            """
            SELECT relation_id, relation_type_code, source_id, target_id, fields::text
            FROM rm_relation
            WHERE workspace_id = ?
              AND source_id IN (
                SELECT object_id FROM rm_object
                WHERE workspace_id = ? AND object_type_code = ?)
              AND target_id IN (
                SELECT object_id FROM rm_object
                WHERE workspace_id = ? AND object_type_code = ?)
            ORDER BY relation_id
            """,
            (row, index) ->
                new DataRelation(
                    row.getObject(1, UUID.class).toString(),
                    row.getString(2),
                    row.getObject(3, UUID.class).toString(),
                    row.getObject(4, UUID.class).toString(),
                    map(row.getString(5))),
            workspaceId,
            workspaceId,
            scopeObjectType,
            workspaceId,
            scopeObjectType);
    return new DataSet(objects, relations);
  }

  UUID objectTypeId(UUID workspaceId, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ? AND published",
        UUID.class,
        workspaceId,
        code);
  }

  UUID relationTypeId(UUID workspaceId, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspaceId,
        code);
  }

  UUID createdObjectId(List<String> eventIds) {
    for (var eventId : eventIds) {
      var value =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (value != null) return UUID.fromString(value);
    }
    throw new IllegalStateException("CreateObject 未产生 ObjectCreated 事件");
  }

  private ObjectView object(java.sql.ResultSet row) throws java.sql.SQLException {
    return new ObjectView(
        row.getObject(1, UUID.class),
        row.getString(2),
        row.getString(3),
        row.getLong(4),
        map(row.getString(5)),
        row.getTimestamp(6).toInstant());
  }

  private RelationView relation(java.sql.ResultSet row) throws java.sql.SQLException {
    return new RelationView(
        row.getObject(1, UUID.class),
        row.getString(2),
        row.getObject(3, UUID.class),
        row.getObject(4, UUID.class),
        map(row.getString(5)),
        row.getBoolean(6),
        row.getString(7),
        row.getLong(8));
  }

  private MatrixView.MatrixObject matrixObject(ObjectView object) {
    var label = object.fields().getOrDefault("name", object.fields().get("title"));
    return new MatrixView.MatrixObject(
        object.objectId(),
        label == null
            ? object.objectType() + " " + object.objectId().toString().substring(0, 8)
            : label.toString(),
        object.status());
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalArgumentException("读模型值无法序列化", failure);
    }
  }

  private Map<String, Object> map(String value) {
    try {
      return mapper.readValue(value, new TypeReference<>() {});
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalArgumentException("读模型值无法解析", failure);
    }
  }

  private static String resultString(java.sql.ResultSet result, int index) {
    try {
      return result.getString(index);
    } catch (java.sql.SQLException failure) {
      throw new IllegalStateException(failure);
    }
  }

  record RelationTypeProjection(String code, boolean hierarchical) {}
}
