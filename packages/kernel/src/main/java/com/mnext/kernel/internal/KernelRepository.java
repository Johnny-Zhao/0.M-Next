package com.mnext.kernel.internal;

import com.mnext.kernel.api.events.EventEnvelope;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class KernelRepository {
  private static final Pattern ULID = Pattern.compile("[0-9A-HJKMNP-TV-Z]{26}");
  private final JdbcTemplate jdbc;

  KernelRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  boolean workspaceWritable(UUID workspaceId) {
    var status =
        jdbc.query(
            "SELECT status FROM workspace WHERE id = ?",
            result -> result.next() ? result.getString(1) : null,
            workspaceId);
    return "ACTIVE".equals(status);
  }

  boolean objectTypePublished(UUID workspaceId, UUID objectTypeId) {
    return Boolean.TRUE.equals(
        jdbc.query(
            "SELECT published FROM object_type WHERE id = ? AND workspace_id = ?",
            result -> result.next() ? result.getBoolean(1) : null,
            objectTypeId,
            workspaceId));
  }

  Map<String, FieldDefinition> fieldDefinitions(UUID objectTypeId) {
    var definitions = new LinkedHashMap<String, FieldDefinition>();
    jdbc.query(
        "SELECT id, code, required FROM field_def WHERE object_type_id = ? ORDER BY code",
        result -> {
          definitions.put(
              result.getString("code"),
              new FieldDefinition(
                  result.getObject("id", UUID.class),
                  result.getString("code"),
                  result.getBoolean("required")));
        },
        objectTypeId);
    return definitions;
  }

  Optional<StoredCommand> findCommand(UUID workspaceId, String idempotencyKey) {
    return jdbc.query(
        """
        SELECT command_id, payload_hash, result_snapshot->'events' AS events
        FROM command_log WHERE workspace_id = ? AND idempotency_key = ?
        """,
        result -> {
          if (!result.next()) return Optional.empty();
          var events = new ArrayList<String>();
          var matcher = ULID.matcher(result.getString("events"));
          while (matcher.find()) events.add(matcher.group());
          return Optional.of(
              new StoredCommand(
                  result.getString("command_id"), result.getString("payload_hash"), events));
        },
        workspaceId,
        idempotencyKey);
  }

  void insertObject(
      UUID objectId,
      UUID workspaceId,
      UUID objectTypeId,
      String status,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO data_object
          (id, workspace_id, object_type_id, status, version,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
        """,
        objectId,
        workspaceId,
        objectTypeId,
        status,
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
  }

  void insertField(UUID objectId, UUID fieldDefId, String valueJson, String actor, Instant now) {
    jdbc.update(
        """
        INSERT INTO data_field_value
          (object_id, field_def_id, value, version, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, CAST(? AS jsonb), 1, ?, ?, ?, ?)
        """,
        objectId,
        fieldDefId,
        valueJson,
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
    insertHistory(objectId, fieldDefId, valueJson, 1, actor, now);
  }

  Optional<ObjectRow> lockObject(UUID workspaceId, UUID objectId) {
    return jdbc.query(
        """
        SELECT id, object_type_id, status, version, created_by FROM data_object
        WHERE id = ? AND workspace_id = ? FOR UPDATE
        """,
        result ->
            result.next()
                ? Optional.of(
                    new ObjectRow(
                        result.getObject("id", UUID.class),
                        result.getObject("object_type_id", UUID.class),
                        result.getString("status"),
                        result.getLong("version"),
                        result.getString("created_by")))
                : Optional.empty(),
        objectId,
        workspaceId);
  }

  Optional<FieldValueRow> lockField(UUID objectId, String fieldCode) {
    return jdbc.query(
        """
        SELECT value.field_def_id, definition.code, value.value::text,
               value.version, value.updated_by, value.updated_at
        FROM data_field_value value JOIN field_def definition ON definition.id = value.field_def_id
        WHERE value.object_id = ? AND definition.code = ? FOR UPDATE OF value
        """,
        result ->
            result.next()
                ? Optional.of(
                    new FieldValueRow(
                        result.getObject(1, UUID.class),
                        result.getString(2),
                        result.getString(3),
                        result.getLong(4),
                        result.getString(5),
                        result.getTimestamp(6).toInstant()))
                : Optional.empty(),
        objectId,
        fieldCode);
  }

  long updateField(
      UUID objectId,
      UUID fieldDefId,
      String valueJson,
      long currentVersion,
      String actor,
      Instant now) {
    var nextVersion = currentVersion + 1;
    jdbc.update(
        """
        UPDATE data_field_value SET value = CAST(? AS jsonb), version = ?,
          updated_by = ?, updated_at = ? WHERE object_id = ? AND field_def_id = ?
        """,
        valueJson,
        nextVersion,
        actor,
        Timestamp.from(now),
        objectId,
        fieldDefId);
    insertHistory(objectId, fieldDefId, valueJson, nextVersion, actor, now);
    return nextVersion;
  }

  boolean sameJson(String left, String right) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT CAST(? AS jsonb) = CAST(? AS jsonb)", Boolean.class, left, right));
  }

  void insertMissingField(
      UUID objectId, UUID fieldDefId, String valueJson, String actor, Instant now) {
    insertField(objectId, fieldDefId, valueJson, actor, now);
  }

  long incrementObjectVersion(UUID objectId, String actor, Instant now) {
    return jdbc.queryForObject(
        """
        UPDATE data_object SET version = version + 1, updated_by = ?, updated_at = ?
        WHERE id = ? RETURNING version
        """,
        Long.class,
        actor,
        Timestamp.from(now),
        objectId);
  }

  long updateObjectStatus(UUID objectId, String status, String actor, Instant now) {
    return jdbc.queryForObject(
        """
        UPDATE data_object SET status = ?, version = version + 1, updated_by = ?, updated_at = ?
        WHERE id = ? RETURNING version
        """,
        Long.class,
        status,
        actor,
        Timestamp.from(now),
        objectId);
  }

  void insertEvent(EventEnvelope event) {
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
        EventJson.encode(event),
        Timestamp.from(event.occurredAt()));
  }

  long nextEventSequence(String targetType, String targetId) {
    return jdbc.queryForObject(
        "SELECT COALESCE(max(sequence), 0) + 1 FROM event_outbox WHERE aggregate_type = ? AND aggregate_id = ?",
        Long.class,
        targetType,
        targetId);
  }

  void insertCommand(
      UUID workspaceId,
      String idempotencyKey,
      String commandId,
      String commandType,
      String payloadHash,
      List<String> events,
      Instant now) {
    var result = Map.of("status", "COMMITTED", "events", events);
    jdbc.update(
        """
        INSERT INTO command_log
          (workspace_id, idempotency_key, command_id, command_type,
           payload_hash, result_snapshot, decided_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        """,
        workspaceId,
        idempotencyKey,
        commandId,
        commandType,
        payloadHash,
        JsonCodec.encode(result),
        Timestamp.from(now));
  }

  void upsertCommand(
      UUID workspaceId,
      String idempotencyKey,
      String commandId,
      String commandType,
      String payloadHash,
      List<String> events,
      Instant now) {
    var result = Map.of("status", "COMMITTED", "events", events);
    jdbc.update(
        """
        INSERT INTO command_log
          (workspace_id, idempotency_key, command_id, command_type,
           payload_hash, result_snapshot, decided_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        ON CONFLICT (workspace_id, idempotency_key) DO UPDATE
          SET result_snapshot = EXCLUDED.result_snapshot, decided_at = EXCLUDED.decided_at
        """,
        workspaceId,
        idempotencyKey,
        commandId,
        commandType,
        payloadHash,
        JsonCodec.encode(result),
        Timestamp.from(now));
  }

  private void insertHistory(
      UUID objectId, UUID fieldDefId, String valueJson, long version, String actor, Instant now) {
    jdbc.update(
        """
        INSERT INTO field_value_history
          (object_id, field_def_id, value, version, changed_by, changed_at)
        VALUES (?, ?, CAST(? AS jsonb), ?, ?, ?)
        """,
        objectId,
        fieldDefId,
        valueJson,
        version,
        actor,
        Timestamp.from(now));
  }
}
