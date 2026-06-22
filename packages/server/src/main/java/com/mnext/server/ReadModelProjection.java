package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.mnext.kernel.api.events.EventEnvelope;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@IdempotentConsumer(group = "readmodel")
class ReadModelProjection {
  private final ReadModelRepository repository;
  private final IdempotentConsumerRegistry registry;
  private final AttachmentRepository attachments;

  @Autowired
  ReadModelProjection(
      ReadModelRepository repository,
      IdempotentConsumerRegistry registry,
      AttachmentRepository attachments) {
    this.repository = repository;
    this.registry = registry;
    this.attachments = attachments;
  }

  ReadModelProjection(ReadModelRepository repository, IdempotentConsumerRegistry registry) {
    this.repository = repository;
    this.registry = registry;
    this.attachments = null;
  }

  @Transactional
  public boolean apply(EventEnvelope event) {
    if (repository.consumed(event.eventId())) return false;
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
      case "FileAttached" -> {
        if (attachments != null) attachments.projectAttached(event);
      }
      case "FileDetached" -> {
        if (attachments != null) attachments.projectDetached(event);
      }
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
    var objectTypeCode =
        repository.objectTypeCode(event.workspaceId(), uuid(after, "objectTypeId"));
    repository.createObject(
        event.workspaceId(),
        uuid(after, "objectId"),
        objectTypeCode,
        text(after, "status", "DRAFT"),
        event.source(),
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
        scalar(after.get("value")),
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
    var relationType = repository.relationType(event.workspaceId(), uuid(after, "relationTypeId"));
    repository.createRelation(
        event.workspaceId(),
        UUID.fromString(event.targetId()),
        relationType.code(),
        uuid(after, "sourceId"),
        uuid(after, "targetId"),
        map(after, "fields"),
        relationType.hierarchical(),
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

  private static Object scalar(Object value) {
    if (!(value instanceof JsonNode node)) return value;
    if (node.isNull()) return null;
    if (node.isNumber()) return node.numberValue();
    if (node.isBoolean()) return node.booleanValue();
    if (node.isTextual()) return node.textValue();
    return value;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> map(Map<String, Object> values, String key) {
    return values.get(key) instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
  }
}
