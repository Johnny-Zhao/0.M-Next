package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.office.ImportMapping;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class ImportRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  ImportRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  void create(
      UUID id,
      UUID workspaceId,
      String storageKey,
      String filename,
      String sha256,
      String actorId,
      Instant createdAt) {
    jdbc.update(
        """
        INSERT INTO import_task
          (id, workspace_id, storage_key, filename, sha256, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, 'REGISTERED', ?, ?)
        """,
        id,
        workspaceId,
        storageKey,
        filename,
        sha256,
        actorId,
        Timestamp.from(createdAt));
  }

  ImportTaskView get(UUID workspaceId, UUID importId) {
    var rows =
        jdbc.query(
            """
            SELECT id, workspace_id, storage_key, filename, sha256, status,
                   mapping::text, result::text, created_by, created_at
            FROM import_task
            WHERE workspace_id = ? AND id = ?
            """,
            (row, index) ->
                new ImportTaskView(
                    row.getObject("id", UUID.class),
                    row.getObject("workspace_id", UUID.class),
                    row.getString("storage_key"),
                    row.getString("filename"),
                    row.getString("sha256"),
                    row.getString("status"),
                    read(row.getString("mapping"), ImportMapping.class),
                    read(row.getString("result"), ImportResult.class),
                    row.getString("created_by"),
                    row.getTimestamp("created_at").toInstant()),
            workspaceId,
            importId);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  void imported(UUID workspaceId, UUID importId, ImportMapping mapping, ImportResult result) {
    jdbc.update(
        """
        UPDATE import_task
        SET status = 'IMPORTED', mapping = CAST(? AS jsonb), result = CAST(? AS jsonb)
        WHERE workspace_id = ? AND id = ?
        """,
        json(mapping),
        json(result),
        workspaceId,
        importId);
  }

  void failed(UUID workspaceId, UUID importId, ImportMapping mapping, ImportResult result) {
    jdbc.update(
        """
        UPDATE import_task
        SET status = 'FAILED', mapping = CAST(? AS jsonb), result = CAST(? AS jsonb)
        WHERE workspace_id = ? AND id = ?
        """,
        json(mapping),
        json(result),
        workspaceId,
        importId);
  }

  private <T> T read(String json, Class<T> type) {
    if (json == null) return null;
    try {
      return mapper.readValue(json, type);
    } catch (JsonProcessingException failure) {
      throw new IllegalStateException("import_task JSON 无法解析", failure);
    }
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("import_task JSON 无法序列化", failure);
    }
  }
}
