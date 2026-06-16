package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record PublishTemplateVersionCommand(
    UUID workspaceId, UUID correlationId, String idempotencyKey, UUID templateVersionId) {}
