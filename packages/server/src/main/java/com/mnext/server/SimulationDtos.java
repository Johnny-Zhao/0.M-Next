package com.mnext.server;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

record SimulationRunView(
    UUID runId,
    UUID snapshotId,
    String engineId,
    String status,
    Map<String, Object> config,
    Map<String, Object> result,
    String resultHash,
    String configHash,
    Instant queuedAt,
    Instant startedAt,
    Instant completedAt,
    String createdBy,
    String failureReason) {}

record SimulationCreateRequest(
    UUID snapshotId, String engineId, Map<String, Object> config, UUID workspaceId) {}
