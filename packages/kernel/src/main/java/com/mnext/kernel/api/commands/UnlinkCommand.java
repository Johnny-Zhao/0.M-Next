package com.mnext.kernel.api.commands;

import java.util.UUID;

public record UnlinkCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID relationId,
    UUID sourceId,
    UUID targetId,
    UUID relationTypeId,
    String reason,
    long expectedVersion,
    boolean acknowledgeImpact) {}
