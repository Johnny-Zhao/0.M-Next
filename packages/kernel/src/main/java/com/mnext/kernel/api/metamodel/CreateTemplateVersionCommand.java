package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record CreateTemplateVersionCommand(
    UUID workspaceId, UUID correlationId, String idempotencyKey, UUID templateId) {}
