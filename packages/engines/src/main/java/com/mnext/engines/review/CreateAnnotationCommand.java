package com.mnext.engines.review;

import java.util.UUID;

public record CreateAnnotationCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    String targetType,
    UUID targetId,
    String fieldCode,
    long anchoredDataVersion,
    String severity,
    String body,
    UUID roundId) {}
