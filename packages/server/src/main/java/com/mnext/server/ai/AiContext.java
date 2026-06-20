package com.mnext.server.ai;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record AiContext(
    ManagementCtx management,
    ProcessCtx process,
    ResultCtx result,
    InteractionCtx interaction,
    SubstrateCtx substrate,
    String contextHash) {
  public record ManagementCtx(
      List<SelectedObjectCtx> selectedObjects,
      List<CheckResultCtx> checkResults,
      List<RuleDefCtx> activeRules) {}

  public record ProcessCtx(Map<String, List<FieldDefCtx>> fieldDefsByObjectType) {}

  public record ResultCtx(Map<UUID, Map<String, Object>> objectFields) {}

  public record InteractionCtx(
      SelectionCtx selection, String action, String instruction, String actorId) {}

  public record SubstrateCtx(
      AiActionProvider.ProviderDescriptor provider,
      Map<String, Object> replayParameters,
      List<String> skillEngineIds) {}

  public record SelectionCtx(List<UUID> objectIds, List<UUID> checkResultIds) {}

  public record SelectedObjectCtx(
      UUID objectId, UUID objectTypeId, String objectType, String status, long version) {}

  public record FieldDefCtx(
      String objectType,
      String code,
      String name,
      String dataType,
      boolean required,
      Map<String, Object> constraints) {}

  public record RuleDefCtx(
      String ruleCode,
      String severity,
      String whenSrc,
      String message,
      String fieldCode,
      boolean lightweight,
      long version) {}

  public record CheckResultCtx(
      UUID checkResultId,
      UUID runId,
      String ruleCode,
      String severity,
      String message,
      UUID objectId,
      String fieldCode,
      String configHash,
      Instant createdAt) {}
}
