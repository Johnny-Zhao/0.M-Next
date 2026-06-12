package com.mnext.kernel.api.commands;

import com.mnext.kernel.api.SourceInfo;
import java.util.Map;
import java.util.UUID;

public record CreateRelationCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID relationTypeId,
    UUID sourceId,
    UUID targetId,
    Map<String, Object> relationFields,
    SourceInfo source) {}
