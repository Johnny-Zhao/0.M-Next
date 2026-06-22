package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record WithdrawTemplateVersionCommand(
    UUID workspaceId, UUID correlationId, String idempotencyKey, UUID templateVersionId) {}
