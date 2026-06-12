package com.mnext.kernel.api.commands;

import java.util.List;
import java.util.UUID;

public record UpdateFieldsCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID objectId,
    long expectedObjectVersion,
    List<FieldUpdate> fields) {}
