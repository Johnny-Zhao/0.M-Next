package com.mnext.kernel.api.commands;

import com.mnext.kernel.api.SourceInfo;
import java.util.Map;
import java.util.UUID;

public record CreateObjectCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID objectTypeId,
    Map<String, Object> fields,
    SourceInfo source,
    String initialState) {}
