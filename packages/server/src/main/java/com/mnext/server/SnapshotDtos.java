package com.mnext.server;

import com.mnext.engines.exchange.DataSet;
import java.time.Instant;
import java.util.UUID;

record SnapshotMeta(
    UUID snapshotId,
    Instant createdAt,
    String createdBy,
    long dataVersion,
    String contentHash,
    String scopeObjectType) {}

record SnapshotDetail(SnapshotMeta meta, DataSet payload) {}

record SnapshotCaptureRequest(String scopeObjectType) {}
