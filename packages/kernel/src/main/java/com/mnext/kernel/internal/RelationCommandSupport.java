package com.mnext.kernel.internal;

import java.util.List;
import java.util.Set;
import java.util.UUID;

final class RelationCommandSupport {
  private final RelationRepository relations;

  RelationCommandSupport(RelationRepository relations) {
    this.relations = relations;
  }

  RelationValidation validateCandidate(
      UUID workspaceId, UUID typeId, UUID sourceId, UUID targetId, UUID excludedRelationId) {
    if (typeId == null || sourceId == null || targetId == null || sourceId.equals(targetId)) {
      throw CommandErrors.endpointInvalid();
    }
    var type = relations.relationType(workspaceId, typeId).orElseThrow(CommandErrors::typeNotFound);
    var endpoints = relations.lockEndpoints(workspaceId, sourceId, targetId);
    if (endpoints.size() != 2 || endpoints.stream().anyMatch(this::invalid)) {
      throw CommandErrors.endpointInvalid();
    }
    var source = endpoint(endpoints, sourceId);
    var target = endpoint(endpoints, targetId);
    if (!source.objectTypeId().equals(type.sourceType())
        || !target.objectTypeId().equals(type.targetType())) {
      throw CommandErrors.endpointInvalid();
    }
    validateDuplicate(workspaceId, typeId, sourceId, targetId, excludedRelationId);
    validateCardinality(workspaceId, type, targetId, excludedRelationId);
    validateCycle(type, sourceId, targetId);
    return new RelationValidation(type, source, target);
  }

  private boolean invalid(EndpointRow endpoint) {
    return Set.of("VOID", "FILED", "DELETED").contains(endpoint.status());
  }

  private EndpointRow endpoint(List<EndpointRow> endpoints, UUID id) {
    return endpoints.stream()
        .filter(endpoint -> endpoint.id().equals(id))
        .findFirst()
        .orElseThrow(CommandErrors::endpointInvalid);
  }

  private void validateDuplicate(
      UUID workspaceId, UUID typeId, UUID sourceId, UUID targetId, UUID excludedId) {
    relations
        .findActive(workspaceId, typeId, sourceId, targetId)
        .filter(existing -> !existing.id().equals(excludedId))
        .ifPresent(
            existing -> {
              throw CommandErrors.duplicateRelation(existing.id().toString());
            });
  }

  private void validateCardinality(
      UUID workspaceId, RelationTypeRow type, UUID targetId, UUID excludedId) {
    if ("one_to_many".equals(type.cardinality())) {
      var current = relations.activeTargetCount(workspaceId, type.id(), targetId, excludedId);
      if (current >= 1) throw CommandErrors.cardinality(type.cardinality(), current);
    }
  }

  private void validateCycle(RelationTypeRow type, UUID sourceId, UUID targetId) {
    if (type.hierarchical() && relations.pathExists(type.id(), targetId, sourceId)) {
      throw CommandErrors.cycle(
          List.of(sourceId.toString(), targetId.toString(), sourceId.toString()));
    }
  }
}
