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
      case "RelationUnlinked" -> relationUnlinked(event);
      case "FileAttached" -> {
        if (attachments != null) attachments.projectAttached(event);
      }
      case "FileDetached" -> {
        if (attachments != null) attachments.projectDetached(event);
      }
      case "ObjectUpdated" -> objectUpdated(event);
      case "BatchCommitted" -> {
        // 批次标记事件,读模型变更由其字段/对象子事件承载。
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
    var objectId = uuid(after, "objectId");
    repository.createObject(
        event.workspaceId(),
        objectId,
        objectTypeCode,
        text(after, "status", "DRAFT"),
        event.source(),
        event.version(),
        event.occurredAt());
    appendHistory(event, objectId, "create", null, null, null);
  }

  private void fieldChanged(EventEnvelope event) {
    var after = event.after();
    var before = event.before();
    var objectId = UUID.fromString(event.targetId().split(":", 2)[0]);
    var fieldCode = text(after, "fieldDefCode", "unknown");
    repository.updateField(
        event.workspaceId(),
        objectId,
        fieldCode,
        scalar(after.get("value")),
        event.version(),
        event.occurredAt());
    appendHistory(
        event,
        objectId,
        "edit",
        fieldCode,
        before != null ? scalar(before.get("value")) : null,
        scalar(after.get("value")));
  }

  private void objectUpdated(EventEnvelope event) {
    // 读模型对象版本单调追平写库对象版本,使前端乐观锁版本匹配、画布反映改动
    repository.bumpObjectVersion(
        event.workspaceId(),
        UUID.fromString(event.targetId()),
        event.version(),
        event.occurredAt());
  }

  private void lifecycle(EventEnvelope event) {
    var status = text(event.after(), "status", terminal(event.eventType()));
    if ("relation".equals(event.targetType())) {
      relationStatus(event, status);
    } else if ("object".equals(event.targetType())) {
      var objectId = UUID.fromString(event.targetId());
      repository.updateObjectStatus(
          event.workspaceId(), objectId, status, event.version(), event.occurredAt());
      appendHistory(event, objectId, lifecycleKind(event.eventType()), null, null, null);
    }
  }

  private void relationCreated(EventEnvelope event) {
    var after = event.after();
    var relationType = repository.relationType(event.workspaceId(), uuid(after, "relationTypeId"));
    var sourceId = uuid(after, "sourceId");
    var targetId = uuid(after, "targetId");
    repository.createRelation(
        event.workspaceId(),
        UUID.fromString(event.targetId()),
        relationType.code(),
        sourceId,
        targetId,
        map(after, "fields"),
        relationType.hierarchical(),
        event.version(),
        event.occurredAt());
    var info = relationInfo(relationType.code(), sourceId, targetId);
    appendHistory(event, sourceId, "link", null, null, info);
    appendHistory(event, targetId, "link", null, null, info);
  }

  private void relationUnlinked(EventEnvelope event) {
    relationStatus(event, "UNLINKED");
    var endpoints =
        repository.relationEndpoints(event.workspaceId(), UUID.fromString(event.targetId()));
    if (endpoints == null) return;
    var info =
        relationInfo(endpoints.relationTypeCode(), endpoints.sourceId(), endpoints.targetId());
    appendHistory(event, endpoints.sourceId(), "unlink", null, null, info);
    appendHistory(event, endpoints.targetId(), "unlink", null, null, info);
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

  /** 事件生命周期类型 → 历史条目 kind。 */
  private static String lifecycleKind(String eventType) {
    return switch (eventType) {
      case "Archived" -> "archive";
      case "SoftDeleted" -> "delete";
      default -> "state";
    };
  }

  private static Map<String, Object> relationInfo(
      String relationType, UUID sourceId, UUID targetId) {
    return Map.of(
        "relationType", relationType,
        "sourceId", sourceId.toString(),
        "targetId", targetId.toString());
  }

  /**
   * 追加对象变更历史(供属性栏「历史」与「版本护照·来源链」)。actor/source 缺省回落 system; 幂等由 rm_object_history 主键 + ON CONFLICT
   * 保证,重复投递不重复落行。
   */
  private void appendHistory(
      EventEnvelope event,
      UUID objectId,
      String kind,
      String fieldCode,
      Object before,
      Object after) {
    var actor = event.actor();
    repository.insertHistory(
        event.workspaceId(),
        objectId,
        event.sequence(),
        event.eventId(),
        kind,
        fieldCode,
        before,
        after,
        actor != null ? actor.kind() : "system",
        actor != null ? actor.id() : null,
        actor != null ? actor.display() : null,
        event.source() != null ? event.source() : "system",
        event.version(),
        event.correlationId(),
        event.occurredAt());
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
