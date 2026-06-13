package com.mnext.engines.review;

import java.util.UUID;

public record ReopenAnnotationCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID annotationId,
    String comment) {}
