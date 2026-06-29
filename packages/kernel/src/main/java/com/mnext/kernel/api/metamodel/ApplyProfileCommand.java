package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record ApplyProfileCommand(
    UUID workspaceId, UUID correlationId, String idempotencyKey, UUID templateId, int version) {}
