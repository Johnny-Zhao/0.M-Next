package com.mnext.kernel.api.commands;

import java.util.List;
import java.util.UUID;

public record BatchCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    List<BatchItem> commands,
    String transactionMode,
    UUID previewId) {}
