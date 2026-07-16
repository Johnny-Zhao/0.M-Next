package com.mnext.server;

import com.mnext.engines.exchange.DataSet;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

record SnapshotMeta(
    UUID snapshotId,
    Instant createdAt,
    String createdBy,
    long dataVersion,
    String contentHash,
    String scopeObjectType) {}

record SnapshotDetail(SnapshotMeta meta, DataSet payload) {}

record SnapshotCaptureRequest(String scopeObjectType, SnapshotTreeScope treeScope) {}

record SnapshotTreeScope(
    UUID rootId, String relationType, Integer maxDepth, List<String> relatedRelationTypes) {
  SnapshotTreeScope(UUID rootId, String relationType, Integer maxDepth) {
    this(rootId, relationType, maxDepth, List.of());
  }

  SnapshotTreeScope {
    relatedRelationTypes =
        relatedRelationTypes == null
            ? List.of()
            : relatedRelationTypes.stream().distinct().toList();
  }
}
