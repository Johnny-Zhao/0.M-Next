package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;

record ExpressionConfigCreateRequest(
    String name, String space, String defaultForm, ExpressionViewCreateRequest view) {}

record ExpressionViewCreateRequest(String kind, JsonNode config) {}

record ExpressionViewConfig(
    String viewId,
    String expressionId,
    String kind,
    JsonNode config,
    long version,
    String createdBy,
    Instant createdAt,
    String updatedBy,
    Instant updatedAt) {}

record ExpressionConfig(
    String expressionId,
    String name,
    String space,
    String defaultViewId,
    String defaultForm,
    long version,
    String createdBy,
    Instant createdAt,
    String updatedBy,
    Instant updatedAt,
    List<ExpressionViewConfig> views) {}
