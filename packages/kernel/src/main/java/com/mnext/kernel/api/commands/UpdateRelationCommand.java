package com.mnext.kernel.api.commands;

import java.util.Map;
import java.util.UUID;

public record UpdateRelationCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID relationId,
    long expectedVersion,
    Map<String, Object> fields,
    UUID sourceId,
    UUID targetId) {}
