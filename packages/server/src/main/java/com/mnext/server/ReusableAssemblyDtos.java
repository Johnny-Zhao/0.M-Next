package com.mnext.server;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

record DefineReusableAssemblyRequest(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID templateVersionId,
    String name,
    Map<String, Object> params,
    Map<String, Object> content) {}

record PlaceAssemblyRequest(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID assemblyId,
    long version,
    String placementKey,
    Map<String, Object> params) {}

record ReusableAssemblyView(
    UUID assemblyId,
    String name,
    UUID templateVersionId,
    String templateCode,
    int templateVersion,
    long version,
    Map<String, Object> params,
    List<String> objectTypes,
    Instant createdAt) {}
