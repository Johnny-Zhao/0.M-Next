package com.mnext.kernel.api.commands;

import java.util.UUID;

public record ArchiveCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    String targetType,
    UUID targetId,
    String reason,
    long expectedVersion,
    String relationPolicy) {}
