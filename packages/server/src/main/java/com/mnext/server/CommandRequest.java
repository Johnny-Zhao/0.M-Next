package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

public record CommandRequest(
    String commandType,
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    JsonNode payload) {}
