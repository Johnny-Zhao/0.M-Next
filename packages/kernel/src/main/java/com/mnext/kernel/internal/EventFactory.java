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
        commandId,
        sequence,
        null);
  }
}
