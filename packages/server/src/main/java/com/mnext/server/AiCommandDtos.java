package com.mnext.server;

import java.util.List;
import java.util.UUID;

record AiActionRequest(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    String action,
    AiSelectionRequest selection,
    String instruction) {}

record RejectAiChangeRequest(
    UUID workspaceId, UUID correlationId, String idempotencyKey, UUID setId) {}

record AiSelectionRequest(List<UUID> objectIds, List<UUID> checkResultIds) {}
