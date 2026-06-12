package com.mnext.kernel.api.events;

import com.mnext.kernel.api.Actor;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record EventEnvelope(
    String eventId,
    String eventType,
    int schemaVersion,
    UUID workspaceId,
    String targetType,
    String targetId,
    long version,
    Map<String, Object> before,
    Map<String, Object> after,
    Actor actor,
    String source,
    Instant occurredAt,
    UUID correlationId,
    String causationId,
    long sequence,
    Map<String, Object> payload) {}
