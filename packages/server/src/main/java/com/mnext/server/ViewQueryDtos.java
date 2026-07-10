package com.mnext.server;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

record FieldDefinitionView(
    String code, String name, String dataType, boolean required, Map<String, Object> constraints) {}

record ObjectTypeView(UUID id, String code, String name, List<FieldDefinitionView> fields) {}

record RelationTypeView(UUID id, String code, String name, boolean hierarchical) {}

record WorkspaceProfileView(
    UUID templateVersionId, String templateCode, String name, int version, Instant appliedAt) {}

record WorkspaceSummaryView(
    UUID workspaceId,
    String name,
    String templateCode,
    Instant updatedAt,
    List<WorkspaceProfileView> profiles) {}

record ObjectView(
    UUID objectId,
    String objectType,
    String status,
    long version,
    Map<String, Object> fields,
    Instant updatedAt,
    String source,
    Map<String, Object> derived,
    String ruleStatus) {}

record RuleStatusView(UUID objectId, String ruleStatus) {}

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

record SimRunSummaryView(
    UUID runId,
    UUID snapshotId,
    String engineId,
    String status,
    Instant queuedAt,
    Instant startedAt,
    Instant completedAt,
    String resultHash,
    String createdBy) {}

record SimResultSeriesPointView(
    UUID objectId, String fieldCode, double t, Double value, Object valueJson) {}

record ObjectDetailView(ObjectView object, List<RelationView> relations) {}

record ObjectHistoryView(
    String eventId,
    long seq,
    String kind,
    String fieldCode,
    Object before,
    Object after,
    String actorKind,
    String actorId,
    String actorDisplay,
    String source,
    long objectVersion,
    UUID correlationId,
    Instant occurredAt) {}

record TreeNodeView(
    UUID sourceId, UUID targetId, int depth, String sourceName, String targetName) {}

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

record MappingFieldMappingView(String targetFieldCode, String expression) {}

record MappingCorrespondenceView(
    UUID correspondenceId,
    String relationType,
    UUID relationTypeId,
    String sourceProfile,
    String targetProfile,
    String sourceTypeCode,
    String sourceTypeName,
    String targetTypeCode,
    String targetTypeName,
    String cardinality,
    String direction,
    List<MappingFieldMappingView> fieldMappings) {}

record MappingCoverageItemView(
    UUID sourceObjectId,
    String sourceLabel,
    long sourceVersion,
    UUID targetObjectId,
    String targetLabel,
    Long targetVersion,
    UUID relationId,
    Long anchoredSourceVersion,
    String status,
    Instant updatedAt) {}

record MappingCoveragePageView(
    List<MappingCoverageItemView> items, int page, int pageSize, long total) {}

record VerificationCoverageView(
    long verified, long unverified, long failed, long total, PageView<VerificationGapView> gaps) {}

record VerificationGapView(
    UUID requirementId, String code, String text, String status, String reason) {}

record MappingProfileView(
    String code,
    String name,
    String correspondenceRelationCode,
    String sourceProfile,
    String targetProfile,
    String sourceTypeCode,
    String targetTypeCode,
    List<ObjectMapping> objectMappings,
    List<RelationMapping> relationMappings) {}

record RankedCandidate(
    UUID candidateId,
    String objectTypeCode,
    Object score,
    int rank,
    boolean recommended,
    Map<String, Object> fields,
    String details,
    List<RecommendationRisk> risks,
    boolean vetoed) {
  RankedCandidate(
      UUID candidateId,
      String objectTypeCode,
      Object score,
      int rank,
      boolean recommended,
      Map<String, Object> fields,
      String details) {
    this(candidateId, objectTypeCode, score, rank, recommended, fields, details, List.of(), false);
  }
}

record RecommendationRisk(String ruleCode, String severity, String message) {}

record RecommendationView(
    RankedCandidate recommended, List<RankedCandidate> alternatives, List<RankedCandidate> vetoed) {
  RecommendationView(RankedCandidate recommended, List<RankedCandidate> alternatives) {
    this(recommended, alternatives, List.of());
  }
}

record LineageView(
    UUID objectId,
    String fieldCode,
    List<LineageNode> upstream,
    LineageAlgorithm algorithm,
    List<LineageNode> downstream,
    boolean partial,
    boolean truncated) {}

record LineageAlgorithm(String kind, String ref) {}

record LineageNode(
    String kind,
    UUID objectId,
    String objectType,
    String fieldCode,
    String ref,
    String source,
    Instant updatedAt,
    int depth) {}
