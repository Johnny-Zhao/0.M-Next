package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

record RuleScopeRequest(String objectTypeCode, String fieldCode) {}

record DefineRuleRequest(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID templateVersionId,
    String ruleCode,
    RuleScopeRequest scope,
    String severity,
    String when,
    String message,
    JsonNode impact,
    String suggest,
    JsonNode fix,
    boolean lightweight) {}

record PublishRuleRequest(
    UUID workspaceId, UUID correlationId, String idempotencyKey, String ruleCode) {}
