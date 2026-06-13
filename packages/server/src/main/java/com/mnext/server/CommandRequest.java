package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

public record CommandRequest(
    @Schema(
            allowableValues = {
              "CreateObject",
              "UpdateFields",
              "ChangeState",
              "CreateRelation",
              "UpdateRelation",
              "Archive",
              "Unlink",
              "SoftDelete",
              "BatchCommand",
              "SubmitAIChangeSet",
              "ConfirmAIChangeSet"
            })
        String commandType,
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    JsonNode payload) {}
