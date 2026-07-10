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
      String sourceKind,
      long version,
      Instant updatedAt) {
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, source_kind, version, fields,
           updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '{}'::jsonb, ?)
        ON CONFLICT (workspace_id, object_id) DO NOTHING
        """,
        workspaceId,
        objectId,
        typeCode,
        status,
        sourceKind,
        version,
        java.sql.Timestamp.from(updatedAt));
  }

  void updateField(
      UUID workspaceId, UUID objectId, String code, Object value, long version, Instant updatedAt) {
    // 字段值按"该字段自己的版本"(field_versions[code])去重排序:仅当来事件版本更高才落库,
    // 旧/重复字段事件不覆盖新值。对象版本由 ObjectUpdated 经 bumpObjectVersion 单独维护,
    // 两套版本计数器互不污染——修"编辑某字段被丢弃 / 持续 409"。
    jdbc.update(
        """
        UPDATE rm_object SET
          fields = jsonb_set(fields, ARRAY[?], CAST(? AS jsonb), TRUE),
          field_versions = jsonb_set(field_versions, ARRAY[?], to_jsonb(?::bigint), TRUE),
          updated_at = GREATEST(updated_at, ?)
        WHERE workspace_id = ? AND object_id = ?
          AND COALESCE((field_versions->>?)::bigint, 0) < ?
        """,
        code,
        json(value),
        code,
        version,
        java.sql.Timestamp.from(updatedAt),
        workspaceId,
        objectId,
        code,
        version);
  }

  /** 把读模型对象版本单调追平写库对象版本(由 ObjectUpdated 事件驱动)。 */
  void bumpObjectVersion(UUID workspaceId, UUID objectId, long version, Instant updatedAt) {
    jdbc.update(
        """
        UPDATE rm_object SET version = GREATEST(version, ?), updated_at = GREATEST(updated_at, ?)
        WHERE workspace_id = ? AND object_id = ?
        """,
        version,
        java.sql.Timestamp.from(updatedAt),
        workspaceId,
        objectId);
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
        WITH RECURSIVE type_chain AS (
          SELECT type.id AS type_id, type.id AS ancestor_type_id, 0 AS depth
          FROM object_type type
          WHERE type.workspace_id = ?
          UNION ALL
          SELECT chain.type_id, parent.id, chain.depth + 1
          FROM type_chain chain
          JOIN object_type child ON child.id = chain.ancestor_type_id
          JOIN object_type parent ON parent.id = child.parent_type_id
          WHERE parent.workspace_id = ? AND chain.depth < 32
        ),
        field_candidate AS (
          SELECT chain.type_id, chain.depth, field.id AS field_id, field.code, field.name,
                 field.data_type, field.value_type_id, field.required, field.constraints
          FROM type_chain chain
          JOIN field_def field ON field.object_type_id = chain.ancestor_type_id
        ),
        effective_field AS (
          SELECT DISTINCT ON (type_id, code)
                 type_id, field_id, code, name, data_type, value_type_id, required, constraints
          FROM field_candidate
          ORDER BY type_id, code, depth ASC
        )
        SELECT type.id, type.code, type.name, field.code, field.name,
               COALESCE(value_type.base_primitive, field.data_type) AS data_type,
               field.required,
               (COALESCE(value_type.constraints, '{}'::jsonb)
                 || COALESCE(field.constraints, '{}'::jsonb))::text AS constraints
        FROM object_type type
        LEFT JOIN effective_field field ON field.type_id = type.id
        LEFT JOIN LATERAL (
          WITH RECURSIVE value_type_chain AS (
            SELECT value_type.id, value_type.base_primitive, value_type.parent_value_type_id,
                   value_type.constraints, 0 AS depth
            FROM value_type
            WHERE value_type.id = field.value_type_id
            UNION ALL
            SELECT parent.id, parent.base_primitive, parent.parent_value_type_id,
                   parent.constraints, child.depth + 1
            FROM value_type parent
            JOIN value_type_chain child ON parent.id = child.parent_value_type_id
            WHERE child.depth < 32
          )
          SELECT (SELECT base_primitive FROM value_type_chain ORDER BY depth DESC LIMIT 1)
                   AS base_primitive,
                 COALESCE(
                   jsonb_object_agg(entry.key, entry.value ORDER BY value_type_chain.depth DESC)
                     FILTER (WHERE entry.key IS NOT NULL),
                   '{}'::jsonb) AS constraints
          FROM value_type_chain
          LEFT JOIN LATERAL jsonb_each(value_type_chain.constraints) entry ON TRUE
        ) value_type ON field.value_type_id IS NOT NULL
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
        workspaceId,
        workspaceId,
        workspaceId);
  }

  List<RelationTypeView> relationTypes(UUID workspaceId) {
    return jdbc.query(
        """
        SELECT id, code, hierarchical
        FROM relation_type
        WHERE workspace_id = ?
        ORDER BY code
        """,
        (row, index) ->
            new RelationTypeView(
                row.getObject(1, UUID.class),
                row.getString(2),
                row.getString(2),
                row.getBoolean(3)),
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
            SELECT object_id, object_type_code, status, version, fields::text, updated_at,
                   source_kind
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
            SELECT object_id, object_type_code, status, version, fields::text, updated_at,
                   source_kind
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

  void insertHistory(
      UUID workspaceId,
      UUID objectId,
      long seq,
      String eventId,
      String kind,
      String fieldCode,
      Object before,
      Object after,
      String actorKind,
      String actorId,
      String actorDisplay,
      String source,
      long objectVersion,
      UUID correlationId,
      Instant occurredAt) {
    jdbc.update(
        """
        INSERT INTO rm_object_history
          (workspace_id, object_id, seq, event_id, kind, field_code, before_val, after_val,
           actor_kind, actor_id, actor_display, source, object_version, correlation_id, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, object_id, event_id) DO NOTHING
        """,
        workspaceId,
        objectId,
        seq,
        eventId,
        kind,
        fieldCode,
        before == null ? null : json(before),
        after == null ? null : json(after),
        actorKind,
        actorId,
        actorDisplay,
        source,
        objectVersion,
        correlationId,
        java.sql.Timestamp.from(occurredAt));
  }

  PageView<ObjectHistoryView> objectHistory(
      UUID workspaceId, UUID objectId, int page, int pageSize) {
    var total =
        jdbc.queryForObject(
            "SELECT count(*) FROM rm_object_history WHERE workspace_id = ? AND object_id = ?",
            Long.class,
            workspaceId,
            objectId);
    var items =
        jdbc.query(
            """
            SELECT event_id, seq, kind, field_code, before_val::text, after_val::text,
                   actor_kind, actor_id, actor_display, source, object_version, correlation_id,
                   occurred_at
            FROM rm_object_history
            WHERE workspace_id = ? AND object_id = ?
            ORDER BY seq DESC, occurred_at DESC LIMIT ? OFFSET ?
            """,
            (row, index) -> objectHistoryRow(row),
            workspaceId,
            objectId,
            pageSize,
            page * pageSize);
    return new PageView<>(items, page, pageSize, total);
  }

  /** 关系两端(供关系历史在两端对象各落一行)。关系不存在返回 null。 */
  RelationEndpoints relationEndpoints(UUID workspaceId, UUID relationId) {
    return jdbc.query(
        """
        SELECT source_id, target_id, relation_type_code
        FROM rm_relation WHERE workspace_id = ? AND relation_id = ?
        """,
        result ->
            result.next()
                ? new RelationEndpoints(
                    UUID.fromString(result.getString(1)),
                    UUID.fromString(result.getString(2)),
                    result.getString(3))
                : null,
        workspaceId,
        relationId);
  }

  private ObjectHistoryView objectHistoryRow(java.sql.ResultSet row) throws java.sql.SQLException {
    var correlation = row.getString("correlation_id");
    return new ObjectHistoryView(
        row.getString("event_id"),
        row.getLong("seq"),
        row.getString("kind"),
        row.getString("field_code"),
        jsonValue(row.getString("before_val")),
        jsonValue(row.getString("after_val")),
        row.getString("actor_kind"),
        row.getString("actor_id"),
        row.getString("actor_display"),
        row.getString("source"),
        row.getLong("object_version"),
        correlation == null ? null : UUID.fromString(correlation),
        row.getTimestamp("occurred_at").toInstant());
  }

  private Object jsonValue(String value) {
    if (value == null) return null;
    try {
      return mapper.readValue(value, Object.class);
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      return value;
    }
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
        SELECT tree.source_id, tree.target_id, tree.depth,
               COALESCE(
                 NULLIF(source.fields->>'name', ''),
                 NULLIF(source.fields->>'title', ''),
                 NULLIF(source.fields->>'code', '')) AS source_name,
               COALESCE(
                 NULLIF(target.fields->>'name', ''),
                 NULLIF(target.fields->>'title', ''),
                 NULLIF(target.fields->>'code', '')) AS target_name
        FROM tree
        LEFT JOIN rm_object source
          ON source.workspace_id = ? AND source.object_id = tree.source_id
        LEFT JOIN rm_object target
          ON target.workspace_id = ? AND target.object_id = tree.target_id
        ORDER BY tree.depth, tree.target_id
        """,
        (row, index) ->
            new TreeNodeView(
                row.getObject(1, UUID.class),
                row.getObject(2, UUID.class),
                row.getInt(3),
                row.getString(4),
                row.getString(5)),
        workspaceId,
        relationType,
        rootId,
        workspaceId,
        relationType,
        workspaceId,
        workspaceId);
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

  PageView<CorrespondenceView> correspondences(
      UUID workspaceId, UUID objectId, String relationType, int page, int size) {
    var total =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM rm_relation
            WHERE workspace_id = ?
              AND relation_type_code = ?
              AND status = 'ACTIVE'
              AND (source_id = ? OR target_id = ?)
            """,
            Long.class,
            workspaceId,
            relationType,
            objectId,
            objectId);
    var items =
        jdbc.query(
            """
            WITH matches AS (
              SELECT relation_id, target_id AS object_id, 'out' AS direction
              FROM rm_relation
              WHERE workspace_id = ?
                AND relation_type_code = ?
                AND status = 'ACTIVE'
                AND source_id = ?
              UNION ALL
              SELECT relation_id, source_id AS object_id, 'in' AS direction
              FROM rm_relation
              WHERE workspace_id = ?
                AND relation_type_code = ?
                AND status = 'ACTIVE'
                AND target_id = ?
            )
            SELECT matches.relation_id, object.object_id, object.object_type_code,
                   object.fields::text, matches.direction
            FROM matches
            JOIN rm_object object
              ON object.workspace_id = ? AND object.object_id = matches.object_id
            ORDER BY matches.direction, object.object_id
            LIMIT ? OFFSET ?
            """,
            (row, index) ->
                new CorrespondenceView(
                    row.getObject(1, UUID.class),
                    row.getObject(2, UUID.class),
                    row.getString(3),
                    map(row.getString(4)),
                    row.getString(5)),
            workspaceId,
            relationType,
            objectId,
            workspaceId,
            relationType,
            objectId,
            workspaceId,
            size,
            page * size);
    return new PageView<>(items, page, size, total);
  }

  List<MappingCorrespondenceView> mappingCorrespondences(UUID workspaceId) {
    return jdbc.query(
        """
        SELECT relation.id, relation.code, relation.direction, relation.cardinality,
               source_type.code AS source_type_code, source_type.name AS source_type_name,
               target_type.code AS target_type_code, target_type.name AS target_type_name,
               template.source_profile_code, template.target_profile_code,
               transform.object_mappings
        FROM relation_type relation
        JOIN workspace_profile profile
          ON profile.workspace_id = relation.workspace_id
         AND profile.template_version_id = relation.template_version_id
        JOIN scene_template_version version ON version.id = relation.template_version_id
        JOIN scene_template template ON template.id = version.template_id
        JOIN object_type source_type ON source_type.id = relation.source_type
        JOIN object_type target_type ON target_type.id = relation.target_type
        LEFT JOIN LATERAL (
          SELECT object_mappings::text AS object_mappings
          FROM m2m_transformation transform
          WHERE transform.workspace_id = relation.workspace_id
            AND transform.template_version_id IS NOT DISTINCT FROM relation.template_version_id
            AND transform.correspondence_relation_code = relation.code
          ORDER BY transform.code
          LIMIT 1
        ) transform ON TRUE
        WHERE relation.workspace_id = ?
          AND relation.kind = 'correspondence'
          AND template.profile_kind = 'mapping'
        ORDER BY template.code, relation.code
        """,
        (row, index) -> {
          var descriptor =
              mappingDescriptor(
                  row.getString("object_mappings"),
                  row.getString("source_type_code"),
                  row.getString("target_type_code"),
                  row.getString("cardinality"),
                  row.getString("direction"));
          return new MappingCorrespondenceView(
              row.getObject("id", UUID.class),
              row.getString("code"),
              row.getObject("id", UUID.class),
              row.getString("source_profile_code"),
              row.getString("target_profile_code"),
              row.getString("source_type_code"),
              row.getString("source_type_name"),
              row.getString("target_type_code"),
              row.getString("target_type_name"),
              descriptor.cardinality(),
              descriptor.direction(),
              descriptor.fieldMappings());
        },
        workspaceId);
  }

  MappingCoveragePageView mappingCoverage(
      UUID workspaceId, UUID correspondenceId, int page, int size) {
    var type = mappingCorrespondenceType(workspaceId, correspondenceId);
    var total =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM rm_object
            WHERE workspace_id = ? AND object_type_code = ?
            """,
            Long.class,
            workspaceId,
            type.sourceTypeCode());
    var items =
        jdbc.query(
            """
            WITH source_page AS (
              SELECT object_id, object_type_code, status, version, fields::text, updated_at
              FROM rm_object
              WHERE workspace_id = ? AND object_type_code = ?
              ORDER BY object_id
              LIMIT ? OFFSET ?
            )
            SELECT source.object_id AS source_id, source.object_type_code AS source_type,
                   source.version AS source_version, source.fields AS source_fields,
                   relation.relation_id, relation.updated_at AS relation_updated_at,
                   target.object_id AS target_id, target.object_type_code AS target_type,
                   target.version AS target_version, target.fields::text AS target_fields
            FROM source_page source
            LEFT JOIN rm_relation relation
              ON relation.workspace_id = ?
             AND relation.relation_type_code = ?
             AND relation.source_id = source.object_id
             AND relation.status = 'ACTIVE'
            LEFT JOIN rm_object target
              ON target.workspace_id = ?
             AND target.object_id = relation.target_id
             AND target.object_type_code = ?
            ORDER BY source.object_id, target.object_id NULLS LAST
            """,
            (row, index) -> {
              var sourceFields = map(row.getString("source_fields"));
              var targetFields = optionalMap(row.getString("target_fields"));
              var targetId = row.getObject("target_id", UUID.class);
              var updatedAt = row.getTimestamp("relation_updated_at");
              return new MappingCoverageItemView(
                  row.getObject("source_id", UUID.class),
                  objectLabel(
                      row.getString("source_type"),
                      row.getObject("source_id", UUID.class),
                      sourceFields),
                  row.getLong("source_version"),
                  targetId,
                  targetId == null
                      ? null
                      : objectLabel(row.getString("target_type"), targetId, targetFields),
                  targetId == null ? null : row.getLong("target_version"),
                  row.getObject("relation_id", UUID.class),
                  null,
                  targetId == null ? "unmapped" : "mapped",
                  updatedAt == null ? null : updatedAt.toInstant());
            },
            workspaceId,
            type.sourceTypeCode(),
            size,
            page * size,
            workspaceId,
            type.relationTypeCode(),
            workspaceId,
            type.targetTypeCode());
    return new MappingCoveragePageView(items, page, size, total);
  }

  List<ObjectView> recommendationCandidates(
      UUID workspaceId, UUID projectId, String relationTypeCode, int limit) {
    return jdbc.query(
        """
        SELECT object.object_id, object.object_type_code, object.status, object.version,
               object.fields::text, object.updated_at, object.source_kind
        FROM rm_relation relation
        JOIN rm_object object
          ON object.workspace_id = relation.workspace_id
         AND object.object_id = relation.target_id
        WHERE relation.workspace_id = ?
          AND relation.source_id = ?
          AND relation.relation_type_code = ?
          AND relation.status = 'ACTIVE'
        ORDER BY relation.target_id
        LIMIT ?
        """,
        (row, index) -> object(row),
        workspaceId,
        projectId,
        relationTypeCode,
        limit);
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

  DataSet dataSet(UUID workspaceId, SnapshotTreeScope treeScope) {
    var nodes =
        jdbc.query(
            """
            WITH RECURSIVE tree AS (
              SELECT object.object_id, NULL::uuid AS parent_id, NULL::uuid AS relation_id,
                     0 AS depth, ARRAY[object.object_id] AS path
              FROM rm_object object
              WHERE object.workspace_id = ? AND object.object_id = ?
              UNION ALL
              SELECT child.object_id, relation.source_id, relation.relation_id,
                     tree.depth + 1, tree.path || child.object_id
              FROM tree
              JOIN rm_relation relation
                ON relation.workspace_id = ?
               AND relation.relation_type_code = ?
               AND relation.source_id = tree.object_id
               AND relation.hierarchical
               AND relation.status = 'ACTIVE'
              JOIN rm_object child
                ON child.workspace_id = relation.workspace_id
               AND child.object_id = relation.target_id
              WHERE tree.depth < ? AND NOT relation.target_id = ANY(tree.path)
            ),
            latest_run AS (
              SELECT run_id
              FROM check_result
              WHERE workspace_id = ?
              GROUP BY run_id
              ORDER BY max(created_at) DESC, run_id
              LIMIT 1
            ),
            rule_status AS (
              SELECT result.object_id,
                     CASE max(CASE result.severity WHEN 'BLOCK' THEN 2 WHEN 'WARN' THEN 1 ELSE 0 END)
                       WHEN 2 THEN 'BLOCK'
                       WHEN 1 THEN 'WARN'
                       ELSE 'OK'
                     END AS value
              FROM check_result result
              JOIN latest_run ON latest_run.run_id = result.run_id
              WHERE result.workspace_id = ?
              GROUP BY result.object_id
            )
            SELECT object.object_id, object.object_type_code, object.fields::text, object.status,
                   object.version, tree.parent_id, tree.relation_id, tree.depth,
                   parent_relation.relation_type_code, parent_relation.source_id,
                   parent_relation.target_id, parent_relation.fields::text,
                   COALESCE(
                     rule_status.value,
                     CASE WHEN latest_run.run_id IS NULL THEN 'UNKNOWN' ELSE 'OK' END)
            FROM tree
            JOIN rm_object object
              ON object.workspace_id = ? AND object.object_id = tree.object_id
            LEFT JOIN rm_relation parent_relation
              ON parent_relation.workspace_id = ?
             AND parent_relation.relation_id = tree.relation_id
            LEFT JOIN latest_run ON TRUE
            LEFT JOIN rule_status ON rule_status.object_id = object.object_id
            ORDER BY tree.path
            """,
            (row, index) ->
                new TreeSnapshotNode(
                    row.getObject(1, UUID.class),
                    row.getString(2),
                    map(row.getString(3)),
                    row.getString(4),
                    row.getLong(5),
                    row.getObject(6, UUID.class),
                    row.getObject(7, UUID.class),
                    row.getInt(8),
                    row.getString(9),
                    row.getObject(10, UUID.class),
                    row.getObject(11, UUID.class),
                    optionalMap(row.getString(12)),
                    row.getString(13)),
            workspaceId,
            treeScope.rootId(),
            workspaceId,
            treeScope.relationType(),
            treeScope.maxDepth(),
            workspaceId,
            workspaceId,
            workspaceId,
            workspaceId);
    if (nodes.isEmpty()) throw new IllegalArgumentException("treeScope.rootId 不存在或不可见");
    var objects =
        java.util.stream.IntStream.range(0, nodes.size())
            .mapToObj(index -> nodes.get(index).object(index))
            .toList();
    var relations =
        nodes.stream().map(TreeSnapshotNode::relation).flatMap(java.util.Optional::stream).toList();
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
        row.getTimestamp(6).toInstant(),
        row.getString(7),
        Map.of(),
        "UNKNOWN");
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

  private MappingCorrespondenceType mappingCorrespondenceType(
      UUID workspaceId, UUID correspondenceId) {
    var matches =
        jdbc.query(
            """
            SELECT relation.code, source_type.code AS source_type_code,
                   target_type.code AS target_type_code
            FROM relation_type relation
            JOIN workspace_profile profile
              ON profile.workspace_id = relation.workspace_id
             AND profile.template_version_id = relation.template_version_id
            JOIN scene_template_version version ON version.id = relation.template_version_id
            JOIN scene_template template ON template.id = version.template_id
            JOIN object_type source_type ON source_type.id = relation.source_type
            JOIN object_type target_type ON target_type.id = relation.target_type
            WHERE relation.workspace_id = ?
              AND relation.id = ?
              AND relation.kind = 'correspondence'
              AND template.profile_kind = 'mapping'
            """,
            (row, index) ->
                new MappingCorrespondenceType(
                    row.getString("code"),
                    row.getString("source_type_code"),
                    row.getString("target_type_code")),
            workspaceId,
            correspondenceId);
    if (matches.isEmpty()) throw new IllegalArgumentException("mapping correspondence 不存在或未应用");
    return matches.getFirst();
  }

  private MappingDescriptor mappingDescriptor(
      String objectMappings,
      String sourceTypeCode,
      String targetTypeCode,
      String fallbackCardinality,
      String fallbackDirection) {
    for (var mapping : objectMappings(objectMappings)) {
      if (sourceTypeCode.equals(mapping.sourceTypeCode())
          && targetTypeCode.equals(mapping.targetTypeCode())) {
        var fields =
            mapping.fieldMappings() == null
                ? List.<MappingFieldMappingView>of()
                : mapping.fieldMappings().stream()
                    .map(
                        field ->
                            new MappingFieldMappingView(
                                field.targetFieldCode(), field.expression()))
                    .toList();
        return new MappingDescriptor(
            mapping.cardinality() == null ? fallbackCardinality : mapping.cardinality(),
            mapping.direction() == null ? fallbackDirection : mapping.direction(),
            fields);
      }
    }
    return new MappingDescriptor(fallbackCardinality, fallbackDirection, List.of());
  }

  private List<ObjectMapping> objectMappings(String value) {
    if (value == null || value.isBlank()) return List.of();
    try {
      return mapper.readValue(value, new TypeReference<>() {});
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalArgumentException("映射定义无法解析", failure);
    }
  }

  private String objectLabel(String objectTypeCode, UUID objectId, Map<String, Object> fields) {
    var label = fields.getOrDefault("name", fields.getOrDefault("title", fields.get("code")));
    return label == null
        ? objectTypeCode + " " + objectId.toString().substring(0, 8)
        : label.toString();
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

  private Map<String, Object> optionalMap(String value) {
    if (value == null) return Map.of();
    return map(value);
  }

  private static String resultString(java.sql.ResultSet result, int index) {
    try {
      return result.getString(index);
    } catch (java.sql.SQLException failure) {
      throw new IllegalStateException(failure);
    }
  }

  record RelationTypeProjection(String code, boolean hierarchical) {}

  record RelationEndpoints(UUID sourceId, UUID targetId, String relationTypeCode) {}

  record MappingCorrespondenceType(
      String relationTypeCode, String sourceTypeCode, String targetTypeCode) {}

  record MappingDescriptor(
      String cardinality, String direction, List<MappingFieldMappingView> fieldMappings) {}

  record TreeSnapshotNode(
      UUID objectId,
      String objectTypeCode,
      Map<String, Object> fields,
      String status,
      long version,
      UUID parentId,
      UUID relationId,
      int depth,
      String relationTypeCode,
      UUID sourceId,
      UUID targetId,
      Map<String, Object> relationFields,
      String ruleStatus) {
    DataObject object(int order) {
      return new DataObject(
          objectId.toString(), objectTypeCode, fieldsWithTree(order), status, version);
    }

    Map<String, Object> fieldsWithTree(int order) {
      var result = new java.util.LinkedHashMap<>(fields);
      var tree = new java.util.LinkedHashMap<String, Object>();
      tree.put("depth", depth);
      tree.put("parentId", parentId == null ? null : parentId.toString());
      tree.put("relationId", relationId == null ? null : relationId.toString());
      tree.put("order", order);
      tree.put("ruleStatus", ruleStatus);
      result.put("_tree", tree);
      return result;
    }

    java.util.Optional<DataRelation> relation() {
      if (relationId == null) return java.util.Optional.empty();
      return java.util.Optional.of(
          new DataRelation(
              relationId.toString(),
              relationTypeCode,
              sourceId.toString(),
              targetId.toString(),
              relationFields));
    }
  }
}
