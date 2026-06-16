package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record InstantiateWorkspaceCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID templateId,
    int version,
    UUID newWorkspaceId,
    String workspaceName) {}
