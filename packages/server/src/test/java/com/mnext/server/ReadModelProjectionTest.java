package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.events.EventEnvelope;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReadModelProjectionTest {
  private static final UUID WORKSPACE = UUID.randomUUID();
  private static final UUID OBJECT = UUID.randomUUID();
  private static final UUID OBJECT_TYPE = UUID.randomUUID();
  private static final UUID RELATION = UUID.randomUUID();
  private static final UUID RELATION_TYPE = UUID.randomUUID();
  private final ReadModelRepository repository = mock(ReadModelRepository.class);
  private final ReadModelProjection projection =
      new ReadModelProjection(repository, new IdempotentConsumerRegistry());

  @Test
  void projectsObjectFieldStateAndRelationEvents() {
    when(repository.objectTypeCode(WORKSPACE, OBJECT_TYPE)).thenReturn("requirement");
    when(repository.relationType(WORKSPACE, RELATION_TYPE))
        .thenReturn(new ReadModelRepository.RelationTypeProjection("decomposes", true));

    projection.apply(event("e1", "ObjectCreated", "object", OBJECT, 1, objectAfter()));
    projection.apply(event("e2", "FieldChanged", "fieldValue", OBJECT, 2, fieldAfter()));
    projection.apply(
        event("e3", "StateChanged", "object", OBJECT, 3, Map.of("status", "CONFIRMED")));
    projection.apply(event("e4", "RelationCreated", "relation", RELATION, 1, relationAfter()));
    projection.apply(
        event("e5", "RelationUnlinked", "relation", RELATION, 2, Map.of("status", "UNLINKED")));

    verify(repository)
        .createObject(
            eq(WORKSPACE), eq(OBJECT), eq("requirement"), eq("DRAFT"), eq("manual"), eq(1L), any());
    verify(repository).updateField(eq(WORKSPACE), eq(OBJECT), eq("budget"), eq(5), eq(2L), any());
    verify(repository)
        .updateObjectStatus(eq(WORKSPACE), eq(OBJECT), eq("CONFIRMED"), eq(3L), any());
    verify(repository)
        .createRelation(
            eq(WORKSPACE),
            eq(RELATION),
            eq("decomposes"),
            eq(OBJECT),
            any(),
            eq(Map.of()),
            eq(true),
            eq(1L),
            any());
    verify(repository)
        .updateRelationStatus(eq(WORKSPACE), eq(RELATION), eq("UNLINKED"), eq(2L), any());
  }

  @Test
  void duplicateEventIsAppliedOnlyOnce() {
    when(repository.objectTypeCode(WORKSPACE, OBJECT_TYPE)).thenReturn("requirement");
    var event = event("duplicate", "ObjectCreated", "object", OBJECT, 1, objectAfter());

    assertTrue(projection.apply(event));
    assertFalse(projection.apply(event));

    verify(repository).createObject(eq(WORKSPACE), eq(OBJECT), any(), any(), any(), eq(1L), any());
  }

  @Test
  void persistedDuplicateSkipsProjection() {
    when(repository.consumed("persisted")).thenReturn(true);

    projection.apply(event("persisted", "ObjectCreated", "object", OBJECT, 1, objectAfter()));

    verify(repository, never())
        .createObject(any(), any(), any(), any(), any(), any(Long.class), any());
  }

  private static EventEnvelope event(
      String id,
      String type,
      String targetType,
      UUID targetId,
      long version,
      Map<String, Object> after) {
    var target = "fieldValue".equals(targetType) ? targetId + ":budget" : targetId.toString();
    return new EventEnvelope(
        id,
        type,
        1,
        WORKSPACE,
        targetType,
        target,
        version,
        null,
        after,
        Actor.user("actor"),
        "manual",
        Instant.parse("2026-06-13T00:00:00Z"),
        UUID.randomUUID(),
        "command",
        version,
        null);
  }

  private static Map<String, Object> objectAfter() {
    return Map.of(
        "objectId", OBJECT.toString(), "objectTypeId", OBJECT_TYPE.toString(), "status", "DRAFT");
  }

  private static Map<String, Object> fieldAfter() {
    return Map.of("fieldDefCode", "budget", "value", 5);
  }

  private static Map<String, Object> relationAfter() {
    return Map.of(
        "relationTypeId", RELATION_TYPE.toString(),
        "sourceId", OBJECT.toString(),
        "targetId", UUID.randomUUID().toString(),
        "fields", Map.of());
  }
}
