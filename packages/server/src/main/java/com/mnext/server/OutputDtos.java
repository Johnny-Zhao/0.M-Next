package com.mnext.server;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record OutputMeta(
    UUID outputId,
    UUID dataSnapshotId,
    String format,
    UUID templateId,
    Integer templateVersion,
    String reviewStatus,
    String checkStatus,
    long dataVersion,
    Instant createdAt,
    String createdBy,
    String contentHash) {}

record OutputDetail(OutputMeta meta, byte[] artifact) {}

record OutputCreateRequest(
    UUID snapshotId,
    String format,
    UUID templateId,
    Integer templateVersion,
    String objectType,
    List<String> fieldOrder,
    UUID workspaceId) {}
