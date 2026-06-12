package com.mnext.kernel.internal;

import com.github.f4b6a3.ulid.UlidCreator;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.events.EventEnvelope;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class EventFactory {
  private EventFactory() {}

  static EventEnvelope objectCreated(
      UUID workspaceId,
      UUID objectId,
      UUID objectTypeId,
      String status,
      Actor actor,
      String source,
      Instant now,
      UUID correlationId,
      String commandId) {
    var after = new LinkedHashMap<String, Object>();
    after.put("objectId", objectId.toString());
    after.put("objectTypeId", objectTypeId.toString());
    after.put("status", status);
    return envelope(
        "ObjectCreated",
        workspaceId,
        "object",
        objectId.toString(),
        1,
        null,
        after,
        actor,
        source,
        now,
        correlationId,
        commandId,
        1);
  }

  static EventEnvelope fieldChanged(
      UUID workspaceId,
      UUID objectId,
      String fieldCode,
      Object beforeValue,
      Object afterValue,
      long fieldVersion,
      Actor actor,
      String source,
      Instant now,
      UUID correlationId,
      String commandId) {
    return envelope(
        "FieldChanged",
        workspaceId,
        "fieldValue",
        objectId + ":" + fieldCode,
        fieldVersion,
        valueSummary(fieldCode, beforeValue),
        valueSummary(fieldCode, afterValue),
        actor,
        source,
        now,
        correlationId,
        commandId,
        fieldVersion);
  }

  static EventEnvelope objectUpdated(
      UUID workspaceId,
      UUID objectId,
      long version,
      List<String> fields,
      Actor actor,
      Instant now,
      UUID correlationId,
      String commandId) {
    return envelope(
        "ObjectUpdated",
        workspaceId,
        "object",
        objectId.toString(),
        version,
        null,
        Map.of("changedFields", fields),
        actor,
        "manual",
        now,
        correlationId,
        commandId,
        version);
  }

  static EventEnvelope stateChanged(
      UUID workspaceId,
      String targetType,
      UUID targetId,
      String beforeState,
      String afterState,
      long version,
      Actor actor,
      Instant now,
      UUID correlationId,
      String commandId) {
    return envelope(
        "StateChanged",
        workspaceId,
        targetType,
        targetId.toString(),
        version,
        Map.of("status", beforeState),
        Map.of("status", afterState),
        actor,
        "manual",
        now,
        correlationId,
        commandId,
        version);
  }

  static EventEnvelope archived(
      UUID workspaceId,
      String targetType,
      UUID targetId,
      String beforeState,
      String reason,
      long version,
      Actor actor,
      Instant now,
      UUID correlationId,
      String commandId) {
    return lifecycle(
        "Archived",
        workspaceId,
        targetType,
        targetId,
        beforeState,
        "VOID",
        reason,
        version,
        actor,
        now,
        correlationId,
        commandId);
  }

  static EventEnvelope softDeleted(
      UUID workspaceId,
      String targetType,
      UUID targetId,
      String beforeState,
      String reason,
      long version,
      Actor actor,
      Instant now,
      UUID correlationId,
      String commandId) {
    return lifecycle(
        "SoftDeleted",
        workspaceId,
        targetType,
        targetId,
        beforeState,
        "DELETED",
        reason,
        version,
        actor,
        now,
        correlationId,
        commandId);
  }

  static EventEnvelope batchCommitted(
      UUID workspaceId,
      String commandId,
      Map<String, Object> result,
      Actor actor,
      Instant now,
      UUID correlationId) {
    return envelope(
        "BatchCommitted",
        workspaceId,
        "batch",
        commandId,
        1,
        null,
        result,
        actor,
        "manual",
        now,
        correlationId,
        commandId,
        1);
  }

  private static EventEnvelope lifecycle(
      String eventType,
      UUID workspaceId,
      String targetType,
      UUID targetId,
      String beforeState,
      String afterState,
      String reason,
      long version,
      Actor actor,
      Instant now,
      UUID correlationId,
      String commandId) {
    return envelope(
        eventType,
        workspaceId,
        targetType,
        targetId.toString(),
        version,
        Map.of("status", beforeState),
        Map.of("status", afterState, "reason", reason),
        actor,
        "manual",
        now,
        correlationId,
        CommandSupport.causationId(commandId),
        version);
  }

  static EventEnvelope relationCreated(
      UUID workspaceId,
      UUID relationId,
      UUID typeId,
      UUID sourceId,
      UUID targetId,
      Map<String, Object> fields,
      Actor actor,
      String source,
      Instant now,
      UUID correlationId,
      String commandId) {
    return envelope(
        "RelationCreated",
        workspaceId,
        "relation",
        relationId.toString(),
        1,
        null,
        relationSummary(typeId, sourceId, targetId, fields),
        actor,
        source,
        now,
        correlationId,
        commandId,
        1);
  }

  static EventEnvelope relationUpdated(
      UUID workspaceId,
      RelationRow before,
      UUID sourceId,
      UUID targetId,
      Map<String, Object> fields,
      long version,
      Actor actor,
      Instant now,
      UUID correlationId,
      String commandId) {
    return envelope(
        "RelationUpdated",
        workspaceId,
        "relation",
        before.id().toString(),
        version,
        relationSummary(
            before.relationTypeId(),
            before.sourceId(),
            before.targetId(),
            Map.of("_json", before.fieldsJson())),
        relationSummary(before.relationTypeId(), sourceId, targetId, fields),
        actor,
        "manual",
        now,
        correlationId,
        commandId,
        version);
  }

  static EventEnvelope relationUnlinked(
      UUID workspaceId,
      RelationRow relation,
      String reason,
      long version,
      Actor actor,
      Instant now,
      UUID correlationId,
      String commandId) {
    var before =
        relationSummary(
            relation.relationTypeId(),
            relation.sourceId(),
            relation.targetId(),
            Map.of("_json", relation.fieldsJson()));
    before.put("status", relation.status());
    return envelope(
        "RelationUnlinked",
        workspaceId,
        "relation",
        relation.id().toString(),
        version,
        before,
        Map.of("status", "UNLINKED", "reason", reason),
        actor,
        "manual",
        now,
        correlationId,
        commandId,
        version);
  }

  private static LinkedHashMap<String, Object> relationSummary(
      UUID typeId, UUID sourceId, UUID targetId, Map<String, Object> fields) {
    var summary = new LinkedHashMap<String, Object>();
    summary.put("relationTypeId", typeId.toString());
    summary.put("sourceId", sourceId.toString());
    summary.put("targetId", targetId.toString());
    summary.put("fields", fields);
    return summary;
  }

  private static Map<String, Object> valueSummary(String fieldCode, Object value) {
    var summary = new LinkedHashMap<String, Object>();
    summary.put("fieldDefCode", fieldCode);
    summary.put("value", value);
    return summary;
  }

  private static EventEnvelope envelope(
      String eventType,
      UUID workspaceId,
      String targetType,
      String targetId,
      long version,
      Map<String, Object> before,
      Map<String, Object> after,
      Actor actor,
      String source,
      Instant now,
      UUID correlationId,
      String commandId,
      long sequence) {
    return new EventEnvelope(
        UlidCreator.getUlid().toString(),
        eventType,
        1,
        workspaceId,
        targetType,
        targetId,
        version,
        before,
        after,
        actor,
        source,
        now,
        correlationId,
        CommandSupport.causationId(commandId),
        sequence,
        null);
  }
}
