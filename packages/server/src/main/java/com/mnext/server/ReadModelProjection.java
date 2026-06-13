package com.mnext.server;

import com.mnext.kernel.api.events.EventEnvelope;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@IdempotentConsumer(group = "readmodel")
class ReadModelProjection {
  private final ReadModelRepository repository;
  private final IdempotentConsumerRegistry registry;

  ReadModelProjection(ReadModelRepository repository, IdempotentConsumerRegistry registry) {
    this.repository = repository;
    this.registry = registry;
  }

  @Transactional
  public boolean apply(EventEnvelope event) {
    return registry.dispatch(
        this,
        event.eventId(),
        () -> {
          if (repository.consumed(event.eventId())) return;
          project(event);
          repository.markConsumed(event.eventId());
        });
  }

  private void project(EventEnvelope event) {
    switch (event.eventType()) {
      case "ObjectCreated" -> objectCreated(event);
      case "FieldChanged" -> fieldChanged(event);
      case "StateChanged", "Archived", "SoftDeleted" -> lifecycle(event);
      case "RelationCreated" -> relationCreated(event);
      case "RelationUpdated" -> relationUpdated(event);
      case "RelationUnlinked" -> relationStatus(event, "UNLINKED");
      case "BatchCommitted", "ObjectUpdated" -> {
        // Child events and field events carry the read-model changes.
      }
      default -> {
        // Other registered events have no read-model mapping in this batch.
      }
    }
  }

  private void objectCreated(EventEnvelope event) {
    var after = event.after();
    repository.createObject(
        event.workspaceId(),
        uuid(after, "objectId"),
        text(after, "objectTypeCode", text(after, "objectTypeId", "unknown")),
        text(after, "status", "DRAFT"),
        event.version(),
        event.occurredAt());
  }

  private void fieldChanged(EventEnvelope event) {
    var after = event.after();
    var objectId = UUID.fromString(event.targetId().split(":", 2)[0]);
    repository.updateField(
        event.workspaceId(),
        objectId,
        text(after, "fieldDefCode", "unknown"),
        after.get("value"),
        event.version(),
        event.occurredAt());
  }

  private void lifecycle(EventEnvelope event) {
    var status = text(event.after(), "status", terminal(event.eventType()));
    if ("relation".equals(event.targetType())) {
      relationStatus(event, status);
    } else if ("object".equals(event.targetType())) {
      repository.updateObjectStatus(
          event.workspaceId(),
          UUID.fromString(event.targetId()),
          status,
          event.version(),
          event.occurredAt());
    }
  }

  private void relationCreated(EventEnvelope event) {
    var after = event.after();
    repository.createRelation(
        event.workspaceId(),
        UUID.fromString(event.targetId()),
        text(after, "relationTypeCode", text(after, "relationTypeId", "unknown")),
        uuid(after, "sourceId"),
        uuid(after, "targetId"),
        map(after, "fields"),
        Boolean.TRUE.equals(after.get("hierarchical")),
        event.version(),
        event.occurredAt());
  }

  private void relationUpdated(EventEnvelope event) {
    var after = event.after();
    repository.updateRelation(
        event.workspaceId(),
        UUID.fromString(event.targetId()),
        uuid(after, "sourceId"),
        uuid(after, "targetId"),
        map(after, "fields"),
        event.version(),
        event.occurredAt());
  }

  private void relationStatus(EventEnvelope event, String status) {
    repository.updateRelationStatus(
        event.workspaceId(),
        UUID.fromString(event.targetId()),
        status,
        event.version(),
        event.occurredAt());
  }

  private static String terminal(String eventType) {
    return "SoftDeleted".equals(eventType) ? "DELETED" : "VOID";
  }

  private static UUID uuid(Map<String, Object> values, String key) {
    return UUID.fromString(values.get(key).toString());
  }

  private static String text(Map<String, Object> values, String key, String fallback) {
    return values != null && values.get(key) != null ? values.get(key).toString() : fallback;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> map(Map<String, Object> values, String key) {
    return values.get(key) instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
  }
}
