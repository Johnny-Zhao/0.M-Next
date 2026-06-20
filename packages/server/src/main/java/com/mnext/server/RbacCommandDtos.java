package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

record RbacCommandRequest(
    String commandType,
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    JsonNode payload) {}

record GrantWorkspaceRoleRequest(
    UUID workspaceId, UUID correlationId, String idempotencyKey, UUID userId, String role) {}

record RevokeWorkspaceRoleRequest(
    UUID workspaceId, UUID correlationId, String idempotencyKey, UUID userId) {}
