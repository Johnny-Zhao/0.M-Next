package com.mnext.kernel.internal;

import com.mnext.kernel.api.events.EventEnvelope;
import java.util.LinkedHashMap;
import java.util.Map;

final class EventJson {
  private EventJson() {}

  static String encode(EventEnvelope event) {
    var values = new LinkedHashMap<String, Object>();
    values.put("eventId", event.eventId());
    values.put("eventType", event.eventType());
    values.put("schemaVersion", event.schemaVersion());
    values.put("workspaceId", event.workspaceId().toString());
    values.put("targetType", event.targetType());
    values.put("targetId", event.targetId());
    values.put("version", event.version());
    values.put("before", event.before());
    values.put("after", event.after());
    values.put("actor", actor(event));
    values.put("source", event.source());
    values.put("occurredAt", event.occurredAt().toString());
    values.put("correlationId", event.correlationId().toString());
    values.put("causationId", event.causationId());
    values.put("sequence", event.sequence());
    if (event.payload() != null) {
      values.put("payload", event.payload());
    }
    return JsonCodec.encode(values);
  }

  private static Map<String, Object> actor(EventEnvelope event) {
    var actor = new LinkedHashMap<String, Object>();
    actor.put("kind", event.actor().kind());
    actor.put("id", event.actor().id());
    if (event.actor().display() != null) actor.put("display", event.actor().display());
    return actor;
  }
}
