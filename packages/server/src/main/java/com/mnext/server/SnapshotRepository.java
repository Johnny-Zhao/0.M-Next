package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class SnapshotRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final ReadModelRepository readModel;

  SnapshotRepository(JdbcTemplate jdbc, ObjectMapper mapper, ReadModelRepository readModel) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.readModel = readModel;
  }

  SnapshotMeta capture(UUID workspaceId, String scopeObjectType, String actor) {
    return capture(workspaceId, scopeObjectType, null, actor);
  }

  SnapshotMeta capture(
      UUID workspaceId, String scopeObjectType, SnapshotTreeScope treeScope, String actor) {
    var payload = snapshotPayload(workspaceId, scopeObjectType, treeScope);
    return store(workspaceId, scopeObjectType, actor, payload);
  }

  private DataSet snapshotPayload(
      UUID workspaceId, String scopeObjectType, SnapshotTreeScope treeScope) {
    if (treeScope != null) {
      if (scopeObjectType != null)
        throw new IllegalArgumentException("treeScope 与 scopeObjectType 不可同时使用");
      return normalize(
          readModel.dataSet(workspaceId, validateTreeScope(workspaceId, treeScope)), true);
    }
    return normalize(
        scopeObjectType == null
            ? readModel.dataSet(workspaceId)
            : readModel.dataSet(workspaceId, scopeObjectType));
  }

  private SnapshotMeta store(
      UUID workspaceId, String scopeObjectType, String actor, DataSet payload) {
    var id = UUID.randomUUID();
    var createdAt = Instant.now();
    var dataVersion = payload.objects().stream().mapToLong(DataObject::version).max().orElse(0);
    var json = json(payload);
    var hash = hash(json);
    jdbc.update(
        """
        INSERT INTO snapshot
          (snapshot_id, workspace_id, created_at, created_by, scope_object_type,
           data_version, content_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb))
        """,
        id,
        workspaceId,
        java.sql.Timestamp.from(createdAt),
        actor,
        scopeObjectType,
        dataVersion,
        hash,
        json);
    return new SnapshotMeta(id, createdAt, actor, dataVersion, hash, scopeObjectType);
  }

  private SnapshotTreeScope validateTreeScope(UUID workspaceId, SnapshotTreeScope treeScope) {
    if (treeScope.rootId() == null) throw new IllegalArgumentException("treeScope.rootId 必填");
    var relationType = treeScope.relationType();
    if (relationType == null || relationType.isBlank())
      throw new IllegalArgumentException("treeScope.relationType 必填");
    var maxDepth = treeScope.maxDepth() == null ? 5 : treeScope.maxDepth();
    if (maxDepth < 1 || maxDepth > 5)
      throw new IllegalArgumentException("treeScope.maxDepth 必须为 1..5");
    if (!readModel.hierarchicalRelationType(workspaceId, relationType)) {
      throw new IllegalArgumentException("treeScope.relationType 必须为 hierarchical");
    }
    return new SnapshotTreeScope(treeScope.rootId(), relationType, maxDepth);
  }

  SnapshotDetail get(UUID workspaceId, UUID snapshotId) {
    var detail =
        jdbc.query(
            """
            SELECT snapshot_id, created_at, created_by, data_version, content_hash,
                   scope_object_type, payload::text
            FROM snapshot WHERE workspace_id = ? AND snapshot_id = ?
            """,
            result -> result.next() ? detail(result) : null,
            workspaceId,
            snapshotId);
    if (detail == null) throw new IllegalArgumentException("快照不存在或不可见");
    return detail;
  }

  PageView<SnapshotMeta> list(UUID workspaceId, int page, int size) {
    var total =
        jdbc.queryForObject(
            "SELECT count(*) FROM snapshot WHERE workspace_id = ?", Long.class, workspaceId);
    var items =
        jdbc.query(
            """
            SELECT snapshot_id, created_at, created_by, data_version, content_hash,
                   scope_object_type
            FROM snapshot WHERE workspace_id = ?
            ORDER BY created_at DESC, snapshot_id LIMIT ? OFFSET ?
            """,
            (row, index) -> meta(row),
            workspaceId,
            size,
            page * size);
    return new PageView<>(items, page, size, total);
  }

  private DataSet normalize(DataSet value) {
    return normalize(value, false);
  }

  private DataSet normalize(DataSet value, boolean preserveObjectOrder) {
    var objects =
        value.objects().stream()
            .map(
                object ->
                    new DataObject(
                        object.objectId(),
                        object.objectTypeCode(),
                        sorted(object.fields()),
                        object.status(),
                        object.version()))
            .sorted(
                preserveObjectOrder
                    ? (left, right) -> 0
                    : Comparator.comparing(DataObject::objectId))
            .toList();
    var relations =
        value.relations().stream()
            .map(
                relation ->
                    new DataRelation(
                        relation.relationId(),
                        relation.relationTypeCode(),
                        relation.sourceId(),
                        relation.targetId(),
                        sorted(relation.fields())))
            .sorted(Comparator.comparing(DataRelation::relationId))
            .toList();
    return new DataSet(objects, relations);
  }

  private Map<String, Object> sorted(Map<String, Object> fields) {
    var result = new TreeMap<String, Object>();
    fields.forEach((key, value) -> result.put(key, sortedValue(value)));
    return result;
  }

  private Object sortedValue(Object value) {
    if (value instanceof Map<?, ?> nested) {
      var result = new TreeMap<String, Object>();
      nested.forEach((key, item) -> result.put(String.valueOf(key), sortedValue(item)));
      return result;
    }
    if (value instanceof List<?> values) return values.stream().map(this::sortedValue).toList();
    return value;
  }

  private SnapshotDetail detail(java.sql.ResultSet row) throws java.sql.SQLException {
    return new SnapshotDetail(meta(row), dataSet(row.getString(7)));
  }

  private SnapshotMeta meta(java.sql.ResultSet row) throws java.sql.SQLException {
    return new SnapshotMeta(
        row.getObject(1, UUID.class),
        row.getTimestamp(2).toInstant(),
        row.getString(3),
        row.getLong(4),
        row.getString(5),
        row.getString(6));
  }

  private DataSet dataSet(String value) {
    try {
      return mapper.readValue(value, DataSet.class);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("快照 payload 无法解析", failure);
    }
  }

  private String json(DataSet value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("快照 payload 无法序列化", failure);
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
