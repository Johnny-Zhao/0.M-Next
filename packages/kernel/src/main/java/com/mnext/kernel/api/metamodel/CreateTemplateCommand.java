package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record CreateTemplateCommand(
    UUID workspaceId, UUID correlationId, String idempotencyKey, String code, String name) {}
