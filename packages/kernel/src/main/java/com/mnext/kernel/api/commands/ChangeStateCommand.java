package com.mnext.kernel.api.commands;

import java.util.UUID;

public record ChangeStateCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    String targetType,
    UUID targetId,
    String fromState,
    String toState,
    String reason,
    long expectedVersion) {}
