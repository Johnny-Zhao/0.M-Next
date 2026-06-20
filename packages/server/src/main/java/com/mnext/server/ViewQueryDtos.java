package com.mnext.server;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

record FieldDefinitionView(
    String code, String name, String dataType, boolean required, Map<String, Object> constraints) {}

record ObjectTypeView(UUID id, String code, String name, List<FieldDefinitionView> fields) {}

record ObjectView(
    UUID objectId,
    String objectType,
    String status,
    long version,
    Map<String, Object> fields,
    Instant updatedAt) {}

record RelationView(
    UUID relationId,
    String relationType,
    UUID sourceId,
    UUID targetId,
    Map<String, Object> fields,
    boolean hierarchical,
    String status,
    long version) {}

record PageView<T>(List<T> items, int page, int pageSize, long total) {}

record ObjectDetailView(ObjectView object, List<RelationView> relations) {}

record TreeNodeView(UUID sourceId, UUID targetId, int depth) {}

record SyncStatusView(long pendingEvents, boolean caughtUp) {}

record CheckResultView(
    UUID runId,
    String ruleCode,
    String severity,
    String message,
    UUID objectId,
    String fieldCode,
    String configHash,
    Instant createdAt) {}

record CorrespondenceView(
    UUID relationId,
    UUID objectId,
    String objectType,
    Map<String, Object> fields,
    String direction) {}

record RankedCandidate(
    UUID candidateId,
    String objectTypeCode,
    Object score,
    int rank,
    boolean recommended,
    Map<String, Object> fields,
    String details) {}

record RecommendationView(RankedCandidate recommended, List<RankedCandidate> alternatives) {}
