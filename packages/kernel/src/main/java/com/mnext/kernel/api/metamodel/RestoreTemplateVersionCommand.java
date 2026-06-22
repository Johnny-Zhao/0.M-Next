package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record RestoreTemplateVersionCommand(
    UUID workspaceId, UUID correlationId, String idempotencyKey, UUID templateVersionId) {}
