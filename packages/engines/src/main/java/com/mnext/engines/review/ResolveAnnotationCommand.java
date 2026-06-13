package com.mnext.engines.review;

import java.util.UUID;

public record ResolveAnnotationCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID annotationId,
    String comment) {}
