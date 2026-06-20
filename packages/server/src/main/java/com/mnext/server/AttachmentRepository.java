package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import com.mnext.kernel.api.events.EventEnvelope;
import com.mnext.server.storage.StorageBackend;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class AttachmentRepository {
  private static final int MAX_PER_OBJECT = 50;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final StorageBackend storage;

  AttachmentRepository(JdbcTemplate jdbc, ObjectMapper mapper, StorageBackend storage) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.storage = storage;
  }

  @Transactional
  CommandResult attach(AttachFileRequest request, String actorId) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    validateAttachPayload(request);
    var payloadHash = hash(json(request));
    var replay = replay(request.workspaceId(), request.idempotencyKey(), payloadHash);
    if (replay != null) return replay.replayed();
    validateStorage(request);
    if (!objectExists(request.workspaceId(), request.objectId())) {
      throw error(
          "ATT-404-NOT-FOUND", "对象不存在", Map.of("objectId", request.objectId()), "确认对象属于当前工作空间");
    }
    if (activeCount(request.workspaceId(), request.objectId()) >= MAX_PER_OBJECT) {
      throw error(
          "ATT-409-TOO-MANY",
          "单对象活动附件数量超过上限",
          Map.of("limit", MAX_PER_OBJECT),
          "先 DetachFile 删除不再需要的附件");
    }
    var now = Instant.now();
    var attachmentId = UUID.randomUUID();
    insertAttachment(attachmentId, request, actorId, now);
    var commandId = commandId();
    var event = fileAttached(attachmentId, request, actorId, now, commandId);
    insertEvent(event);
    var result =
        new CommandResult(
            commandId,
            CommandStatus.COMMITTED,
            false,
            List.of("attachmentId=" + attachmentId, event.eventId()),
            null);
    remember(
        request.workspaceId(),
        request.idempotencyKey(),
        commandId,
        "AttachFile",
        payloadHash,
        result);
    return result;
  }

  @Transactional
  CommandResult detach(DetachFileRequest request, String actorId) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    if (request.attachmentId() == null) {
      throw error("ATT-400-SCHEMA-INVALID", "attachmentId 必填", Map.of(), "按附件命令 Schema 修正载荷");
    }
    var payloadHash = hash(json(request));
    var replay = replay(request.workspaceId(), request.idempotencyKey(), payloadHash);
    if (replay != null) return replay.replayed();
    var attachment = activeAttachment(request.workspaceId(), request.attachmentId());
    if (attachment == null) {
      throw error(
          "ATT-404-NOT-FOUND",
          "附件不存在或已删除",
          Map.of("attachmentId", request.attachmentId()),
          "刷新附件列表后重试");
    }
    jdbc.update(
        "UPDATE attachment SET status = 'DELETED' WHERE id = ? AND workspace_id = ?",
        request.attachmentId(),
        request.workspaceId());
    var now = Instant.now();
    var commandId = commandId();
    var event = fileDetached(request, attachment, actorId, now, commandId);
    insertEvent(event);
    var result =
        new CommandResult(
            commandId, CommandStatus.COMMITTED, false, List.of(event.eventId()), null);
    remember(
        request.workspaceId(),
        request.idempotencyKey(),
        commandId,
        "DetachFile",
        payloadHash,
        result);
    return result;
  }

  List<AttachmentView> attachments(UUID workspaceId, UUID objectId, String status) {
    var rows =
        jdbc.query(
            """
            SELECT id, object_id, filename, content_type, size_bytes, sha256,
                   status, created_by, created_at
            FROM rm_attachment
            WHERE workspace_id = ? AND object_id = ? AND status = ?
            ORDER BY created_at DESC, id
            LIMIT 200
            """,
            (row, index) ->
                new AttachmentView(
                    row.getObject("id", UUID.class),
                    row.getObject("object_id", UUID.class),
                    row.getString("filename"),
                    row.getString("content_type"),
                    row.getLong("size_bytes"),
                    row.getString("sha256"),
                    row.getString("status"),
                    row.getString("created_by"),
                    row.getTimestamp("created_at").toInstant()),
            workspaceId,
            objectId,
            status);
    return List.copyOf(rows);
  }

  AttachmentContent content(UUID workspaceId, UUID attachmentId) {
    var rows =
        jdbc.query(
            """
            SELECT id, filename, content_type, size_bytes, storage_key
            FROM rm_attachment
            WHERE workspace_id = ? AND id = ? AND status = 'ACTIVE'
            """,
            (row, index) ->
                new AttachmentContent(
                    row.getObject("id", UUID.class),
                    row.getString("filename"),
                    row.getString("content_type"),
                    row.getLong("size_bytes"),
                    row.getString("storage_key")),
            workspaceId,
            attachmentId);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  boolean blobExists(String storageKey) {
    return storage.exists(storageKey);
  }

  void projectAttached(EventEnvelope event) {
    var after = event.after();
    jdbc.update(
        """
        INSERT INTO rm_attachment
          (id, workspace_id, object_id, scope_ref, filename, content_type, size_bytes,
           sha256, storage_key, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          filename = EXCLUDED.filename,
          content_type = EXCLUDED.content_type,
          size_bytes = EXCLUDED.size_bytes,
          sha256 = EXCLUDED.sha256,
          storage_key = EXCLUDED.storage_key
        """,
        UUID.fromString(event.targetId()),
        event.workspaceId(),
        uuid(after, "objectId"),
        textOrNull(after, "scopeRef"),
        text(after, "filename"),
        text(after, "contentType"),
        longValue(after, "sizeBytes"),
        text(after, "sha256"),
        text(after, "storageKey"),
        event.actor().id(),
        Timestamp.from(event.occurredAt()));
  }

  void projectDetached(EventEnvelope event) {
    jdbc.update(
        """
        UPDATE rm_attachment
        SET status = 'DELETED'
        WHERE id = ? AND workspace_id = ?
        """,
        UUID.fromString(event.targetId()),
        event.workspaceId());
  }

  private void insertAttachment(
      UUID attachmentId, AttachFileRequest request, String actorId, Instant now) {
    jdbc.update(
        """
        INSERT INTO attachment
          (id, workspace_id, object_id, scope_ref, filename, content_type, size_bytes,
           sha256, storage_key, status, created_by, created_at, idempotency_key)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
        """,
        attachmentId,
        request.workspaceId(),
        request.objectId(),
        request.filename(),
        request.contentType(),
        request.sizeBytes(),
        request.sha256(),
        request.storageKey(),
        actorId,
        Timestamp.from(now),
        request.idempotencyKey());
  }

  private StoredAttachment activeAttachment(UUID workspaceId, UUID attachmentId) {
    var rows =
        jdbc.query(
            """
            SELECT id, object_id, filename, content_type, size_bytes, sha256, storage_key, created_by
            FROM attachment
            WHERE workspace_id = ? AND id = ? AND status = 'ACTIVE'
            """,
            (row, index) ->
                new StoredAttachment(
                    row.getObject("id", UUID.class),
                    row.getObject("object_id", UUID.class),
                    row.getString("filename"),
                    row.getString("content_type"),
                    row.getLong("size_bytes"),
                    row.getString("sha256"),
                    row.getString("storage_key"),
                    row.getString("created_by")),
            workspaceId,
            attachmentId);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private void validateStorage(AttachFileRequest request) {
    try {
      if (!storage.exists(request.storageKey())) {
        throw error(
            "ATT-409-BLOB-MISMATCH",
            "blob 不存在",
            Map.of("storageKey", request.storageKey()),
            "先上传 blob 后再 AttachFile");
      }
      var stat = storage.stat(request.storageKey());
      if (stat.sizeBytes() != request.sizeBytes() || !stat.sha256().equals(request.sha256())) {
        throw error("ATT-409-BLOB-MISMATCH", "blob 元数据与命令载荷不一致", Map.of(), "使用 blob 上传返回值重试");
      }
    } catch (java.io.IOException failure) {
      throw error("ATT-409-BLOB-MISMATCH", "blob 元数据读取失败", Map.of(), "重新上传 blob 后重试");
    }
  }

  private boolean objectExists(UUID workspaceId, UUID objectId) {
    var count =
        jdbc.queryForObject(
            "SELECT count(*) FROM data_object WHERE workspace_id = ? AND id = ?",
            Integer.class,
            workspaceId,
            objectId);
    return count != null && count > 0;
  }

  private int activeCount(UUID workspaceId, UUID objectId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM attachment WHERE workspace_id = ? AND object_id = ? AND status = 'ACTIVE'",
        Integer.class,
        workspaceId,
        objectId);
  }

  private EventEnvelope fileAttached(
      UUID attachmentId, AttachFileRequest request, String actorId, Instant now, String commandId) {
    var after =
        new java.util.LinkedHashMap<String, Object>(
            Map.of(
                "attachmentId", attachmentId.toString(),
                "objectId", request.objectId().toString(),
                "filename", request.filename(),
                "contentType", request.contentType(),
                "sizeBytes", request.sizeBytes(),
                "sha256", request.sha256(),
                "storageKey", request.storageKey(),
                "status", "ACTIVE"));
    return envelope(
        "FileAttached",
        request.workspaceId(),
        attachmentId,
        1,
        null,
        after,
        Actor.user(actorId),
        now,
        request.correlationId(),
        commandId);
  }

  private EventEnvelope fileDetached(
      DetachFileRequest request,
      StoredAttachment attachment,
      String actorId,
      Instant now,
      String commandId) {
    var before =
        Map.<String, Object>of(
            "attachmentId", attachment.id().toString(),
            "objectId", attachment.objectId().toString(),
            "filename", attachment.filename(),
            "contentType", attachment.contentType(),
            "sizeBytes", attachment.sizeBytes(),
            "sha256", attachment.sha256(),
            "storageKey", attachment.storageKey(),
            "status", "ACTIVE");
    var after =
        Map.<String, Object>of(
            "attachmentId", attachment.id().toString(),
            "objectId", attachment.objectId().toString(),
            "status", "DELETED");
    return envelope(
        "FileDetached",
        request.workspaceId(),
        request.attachmentId(),
        2,
        before,
        after,
        Actor.user(actorId),
        now,
        request.correlationId(),
        commandId);
  }

  private EventEnvelope envelope(
      String eventType,
      UUID workspaceId,
      UUID attachmentId,
      long version,
      Map<String, Object> before,
      Map<String, Object> after,
      Actor actor,
      Instant now,
      UUID correlationId,
      String commandId) {
    return new EventEnvelope(
        commandId(),
        eventType,
        1,
        workspaceId,
        "artifact",
        attachmentId.toString(),
        version,
        before,
        after,
        actor,
        "manual",
        now,
        correlationId,
        commandId,
        nextSequence(attachmentId),
        null);
  }

  private long nextSequence(UUID attachmentId) {
    return jdbc.queryForObject(
        "SELECT COALESCE(max(sequence), 0) + 1 FROM event_outbox WHERE aggregate_type = 'artifact' AND aggregate_id = ?",
        Long.class,
        attachmentId.toString());
  }

  private void insertEvent(EventEnvelope event) {
    jdbc.update(
        """
        INSERT INTO event_outbox
          (id, event_type, aggregate_type, aggregate_id, sequence, payload, created_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        """,
        event.eventId(),
        event.eventType(),
        event.targetType(),
        event.targetId(),
        event.sequence(),
        json(event),
        Timestamp.from(event.occurredAt()));
  }

  private CommandResult replay(UUID workspaceId, String idempotencyKey, String payloadHash) {
    var stored =
        jdbc.query(
            """
            SELECT payload_hash, result_snapshot::text
            FROM command_log WHERE workspace_id = ? AND idempotency_key = ?
            """,
            (row, index) -> new StoredCommand(row.getString(1), row.getString(2)),
            workspaceId,
            idempotencyKey);
    if (stored.isEmpty()) return null;
    var command = stored.getFirst();
    if (!command.payloadHash().equals(payloadHash)) {
      throw error("ATT-409-IDEMPOTENCY-CONFLICT", "幂等键已被不同载荷使用", Map.of(), "更换 idempotencyKey 后重试");
    }
    try {
      return mapper.readValue(command.resultJson(), CommandResult.class);
    } catch (JsonProcessingException failure) {
      throw new IllegalStateException("附件命令结果无法反序列化", failure);
    }
  }

  private void remember(
      UUID workspaceId,
      String idempotencyKey,
      String commandId,
      String commandType,
      String payloadHash,
      CommandResult result) {
    jdbc.update(
        """
        INSERT INTO command_log
          (workspace_id, idempotency_key, command_id, command_type, payload_hash,
           result_snapshot, decided_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        """,
        workspaceId,
        idempotencyKey,
        commandId,
        commandType,
        payloadHash,
        json(result),
        Timestamp.from(Instant.now()));
  }

  private void validateEnvelope(UUID workspaceId, String idempotencyKey) {
    if (workspaceId == null) {
      throw error("ATT-400-SCHEMA-INVALID", "workspaceId 必填", Map.of(), "按附件命令 Schema 修正载荷");
    }
    if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128) {
      throw error(
          "ATT-400-SCHEMA-INVALID", "idempotencyKey 长度必须为 1..128", Map.of(), "按附件命令 Schema 修正载荷");
    }
  }

  private void validateAttachPayload(AttachFileRequest request) {
    if (request.objectId() == null
        || request.filename() == null
        || request.filename().isBlank()
        || request.contentType() == null
        || request.contentType().isBlank()
        || request.sizeBytes() < 0
        || request.sha256() == null
        || !request.sha256().matches("[0-9a-f]{64}")
        || request.storageKey() == null
        || !request.storageKey().matches("[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{64}")) {
      throw error("ATT-400-SCHEMA-INVALID", "AttachFile 载荷无效", Map.of(), "按附件命令 Schema 修正载荷");
    }
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("附件命令 JSON 无法序列化", failure);
    }
  }

  private static UUID uuid(Map<String, Object> values, String key) {
    return UUID.fromString(values.get(key).toString());
  }

  private static String text(Map<String, Object> values, String key) {
    return values.get(key).toString();
  }

  private static String textOrNull(Map<String, Object> values, String key) {
    return values.get(key) == null ? null : values.get(key).toString();
  }

  private static long longValue(Map<String, Object> values, String key) {
    return ((Number) values.get(key)).longValue();
  }

  private static String hash(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }

  private static String commandId() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 26);
  }

  private static CommandRejectedException error(
      String code, String message, Map<String, Object> details, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, details, suggestion));
  }

  private record StoredCommand(String payloadHash, String resultJson) {}

  private record StoredAttachment(
      UUID id,
      UUID objectId,
      String filename,
      String contentType,
      long sizeBytes,
      String sha256,
      String storageKey,
      String createdBy) {}
}
