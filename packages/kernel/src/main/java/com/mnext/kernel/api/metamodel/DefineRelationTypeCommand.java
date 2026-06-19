package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record DefineRelationTypeCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    String code,
    String name,
    UUID sourceTypeId,
    UUID targetTypeId,
    String direction,
    String cardinality,
    String semantics,
    boolean hierarchical,
    UUID templateVersionId) {
  public DefineRelationTypeCommand(
      UUID workspaceId,
      UUID correlationId,
      String idempotencyKey,
      String code,
      String name,
      UUID sourceTypeId,
      UUID targetTypeId,
      String direction,
      String cardinality,
      String semantics,
      boolean hierarchical) {
    this(
        workspaceId,
        correlationId,
        idempotencyKey,
        code,
        name,
        sourceTypeId,
        targetTypeId,
        direction,
        cardinality,
        semantics,
        hierarchical,
        null);
  }
}
