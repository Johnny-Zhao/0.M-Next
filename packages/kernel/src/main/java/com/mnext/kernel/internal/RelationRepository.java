package com.mnext.kernel.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class RelationRepository {
  private final JdbcTemplate jdbc;

  RelationRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  List<EndpointRow> lockEndpoints(UUID workspaceId, UUID first, UUID second) {
    var ids = new ArrayList<>(List.of(first, second));
    ids.sort(Comparator.comparing(UUID::toString));
    return jdbc.query(
        """
        SELECT id, object_type_id, status FROM data_object
        WHERE workspace_id = ? AND id IN (?, ?) ORDER BY id FOR UPDATE
        """,
        (row, ignored) ->
            new EndpointRow(
                row.getObject(1, UUID.class), row.getObject(2, UUID.class), row.getString(3)),
        workspaceId,
        ids.get(0),
        ids.get(1));
  }

  Optional<RelationTypeRow> relationType(UUID workspaceId, UUID typeId) {
    return jdbc.query(
        """
        SELECT id, source_type, target_type, direction, cardinality, semantics, hierarchical
        FROM relation_type WHERE workspace_id = ? AND id = ?
        """,
        result ->
            result.next()
                ? Optional.of(
                    new RelationTypeRow(
                        result.getObject(1, UUID.class),
                        result.getObject(2, UUID.class),
                        result.getObject(3, UUID.class),
                        result.getString(4),
                        result.getString(5),
                        result.getString(6),
                        result.getBoolean(7)))
                : Optional.empty(),
        workspaceId,
        typeId);
  }

  Optional<RelationRow> findActive(UUID workspaceId, UUID typeId, UUID sourceId, UUID targetId) {
    return find(
        """
        SELECT id, relation_type_id, source_id, target_id, fields::text, status, version, created_by
        FROM data_relation
        WHERE workspace_id = ? AND relation_type_id = ? AND source_id = ? AND target_id = ?
          AND status = 'ACTIVE'
        """,
        workspaceId,
        typeId,
        sourceId,
        targetId);
  }

  Optional<RelationRow> lockRelation(UUID workspaceId, UUID relationId) {
    return find(
        """
        SELECT id, relation_type_id, source_id, target_id, fields::text, status, version, created_by
        FROM data_relation WHERE workspace_id = ? AND id = ? FOR UPDATE
        """,
        workspaceId,
        relationId);
  }

  Optional<RelationRow> lockRelation(UUID workspaceId, UUID typeId, UUID sourceId, UUID targetId) {
    return find(
        """
        SELECT id, relation_type_id, source_id, target_id, fields::text, status, version, created_by
        FROM data_relation
        WHERE workspace_id = ? AND relation_type_id = ? AND source_id = ? AND target_id = ?
        ORDER BY (status = 'ACTIVE') DESC, version DESC LIMIT 1 FOR UPDATE
        """,
        workspaceId,
        typeId,
        sourceId,
        targetId);
  }

  List<RelationRow> lockActiveForObject(UUID workspaceId, UUID objectId, int limit) {
    return jdbc.query(
        """
        SELECT id, relation_type_id, source_id, target_id, fields::text, status, version, created_by
        FROM data_relation
        WHERE workspace_id = ? AND status = 'ACTIVE' AND (source_id = ? OR target_id = ?)
        ORDER BY id LIMIT ? FOR UPDATE
        """,
        (row, ignored) ->
            new RelationRow(
                row.getObject(1, UUID.class),
                row.getObject(2, UUID.class),
                row.getObject(3, UUID.class),
                row.getObject(4, UUID.class),
                row.getString(5),
                row.getString(6),
                row.getLong(7),
                row.getString(8)),
        workspaceId,
        objectId,
        objectId,
        limit);
  }

  long activeForObjectCount(UUID workspaceId, UUID objectId) {
    return jdbc.queryForObject(
        """
        SELECT count(*) FROM data_relation
        WHERE workspace_id = ? AND status = 'ACTIVE' AND (source_id = ? OR target_id = ?)
        """,
        Long.class,
        workspaceId,
        objectId,
        objectId);
  }

  long activeTargetCount(UUID workspaceId, UUID typeId, UUID targetId, UUID excludedId) {
    return jdbc.queryForObject(
        """
        SELECT count(*) FROM data_relation
        WHERE workspace_id = ? AND relation_type_id = ? AND target_id = ?
          AND status = 'ACTIVE' AND id <> ?
        """,
        Long.class,
        workspaceId,
        typeId,
        targetId,
        excludedId);
  }

  boolean pathExists(UUID typeId, UUID ancestorId, UUID descendantId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS (
              SELECT 1 FROM relation_closure
              WHERE relation_type_id = ? AND ancestor_id = ? AND descendant_id = ?
            )
            """,
            Boolean.class,
            typeId,
            ancestorId,
            descendantId));
  }

  boolean insertRelation(
      UUID id,
      UUID workspaceId,
      UUID typeId,
      UUID sourceId,
      UUID targetId,
      String fields,
      String actor,
      Instant now) {
    var inserted =
        jdbc.update(
            """
        INSERT INTO data_relation
          (id, workspace_id, relation_type_id, source_id, target_id, fields, status, version,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), 'ACTIVE', 1, ?, ?, ?, ?)
        ON CONFLICT (relation_type_id, source_id, target_id) WHERE status = 'ACTIVE' DO NOTHING
        """,
            id,
            workspaceId,
            typeId,
            sourceId,
            targetId,
            fields,
            actor,
            actor,
            Timestamp.from(now),
            Timestamp.from(now));
    if (inserted == 0) return false;
    insertHistory(id, typeId, sourceId, targetId, fields, "ACTIVE", 1, actor, now);
    return true;
  }

  long updateRelation(
      RelationRow relation,
      UUID sourceId,
      UUID targetId,
      String fields,
      String actor,
      Instant now) {
    var version = relation.version() + 1;
    jdbc.update(
        """
        UPDATE data_relation SET source_id = ?, target_id = ?, fields = fields || CAST(? AS jsonb),
          version = ?, updated_by = ?, updated_at = ? WHERE id = ?
        """,
        sourceId,
        targetId,
        fields,
        version,
        actor,
        Timestamp.from(now),
        relation.id());
    insertHistory(
        relation.id(),
        relation.relationTypeId(),
        sourceId,
        targetId,
        jdbc.queryForObject(
            "SELECT fields::text FROM data_relation WHERE id = ?", String.class, relation.id()),
        "ACTIVE",
        version,
        actor,
        now);
    return version;
  }

  long unlink(RelationRow relation, String actor, Instant now) {
    var version = relation.version() + 1;
    jdbc.update(
        """
        UPDATE data_relation SET status = 'UNLINKED', version = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
        """,
        version,
        actor,
        Timestamp.from(now),
        relation.id());
    insertHistory(
        relation.id(),
        relation.relationTypeId(),
        relation.sourceId(),
        relation.targetId(),
        relation.fieldsJson(),
        "UNLINKED",
        version,
        actor,
        now);
    return version;
  }

  long updateStatus(RelationRow relation, String status, String actor, Instant now) {
    var version = relation.version() + 1;
    jdbc.update(
        """
        UPDATE data_relation SET status = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ?
        """,
        status,
        version,
        actor,
        Timestamp.from(now),
        relation.id());
    insertHistory(
        relation.id(),
        relation.relationTypeId(),
        relation.sourceId(),
        relation.targetId(),
        relation.fieldsJson(),
        status,
        version,
        actor,
        now);
    return version;
  }

  void insertClosure(UUID typeId, UUID sourceId, UUID targetId) {
    jdbc.update(
        """
        INSERT INTO relation_closure (relation_type_id, ancestor_id, descendant_id, depth)
        SELECT ?, ancestors.id, descendants.id, ancestors.depth + descendants.depth + 1
        FROM (
          SELECT ?::uuid id, 0 depth UNION ALL
          SELECT ancestor_id, depth FROM relation_closure
          WHERE relation_type_id = ? AND descendant_id = ?
        ) ancestors
        CROSS JOIN (
          SELECT ?::uuid id, 0 depth UNION ALL
          SELECT descendant_id, depth FROM relation_closure
          WHERE relation_type_id = ? AND ancestor_id = ?
        ) descendants
        ON CONFLICT (relation_type_id, ancestor_id, descendant_id)
        DO UPDATE SET depth = LEAST(relation_closure.depth, EXCLUDED.depth)
        """,
        typeId,
        sourceId,
        typeId,
        sourceId,
        targetId,
        typeId,
        targetId);
  }

  void deleteClosure(UUID typeId, UUID sourceId, UUID targetId) {
    jdbc.update(
        """
        DELETE FROM relation_closure
        WHERE relation_type_id = ?
          AND ancestor_id IN (
            SELECT ancestor_id FROM relation_closure
            WHERE relation_type_id = ? AND descendant_id = ? UNION SELECT ?
          )
          AND descendant_id IN (
            SELECT descendant_id FROM relation_closure
            WHERE relation_type_id = ? AND ancestor_id = ? UNION SELECT ?
          )
        """,
        typeId,
        typeId,
        sourceId,
        sourceId,
        typeId,
        targetId,
        targetId);
  }

  private Optional<RelationRow> find(String sql, Object... arguments) {
    return jdbc.query(
        sql,
        result ->
            result.next()
                ? Optional.of(
                    new RelationRow(
                        result.getObject(1, UUID.class),
                        result.getObject(2, UUID.class),
                        result.getObject(3, UUID.class),
                        result.getObject(4, UUID.class),
                        result.getString(5),
                        result.getString(6),
                        result.getLong(7),
                        result.getString(8)))
                : Optional.empty(),
        arguments);
  }

  private void insertHistory(
      UUID id,
      UUID typeId,
      UUID sourceId,
      UUID targetId,
      String fields,
      String status,
      long version,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO relation_history
          (relation_id, relation_type_id, source_id, target_id, fields, status,
           version, changed_by, changed_at)
        VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?)
        """,
        id,
        typeId,
        sourceId,
        targetId,
        fields,
        status,
        version,
        actor,
        Timestamp.from(now));
  }
}
