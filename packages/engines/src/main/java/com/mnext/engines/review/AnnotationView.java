package com.mnext.engines.review;

import java.time.Instant;
import java.util.UUID;

public record AnnotationView(
    UUID id,
    UUID workspaceId,
    UUID roundId,
    String targetType,
    UUID targetId,
    String fieldCode,
    long anchoredDataVersion,
    String severity,
    String body,
    String status,
    String createdBy,
    Instant createdAt,
    String resolvedBy,
    Instant resolvedAt) {}
