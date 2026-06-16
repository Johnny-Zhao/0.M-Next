package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record ApplyTemplateVersionCommand(
    UUID workspaceId, UUID correlationId, String idempotencyKey, int toVersion) {}
