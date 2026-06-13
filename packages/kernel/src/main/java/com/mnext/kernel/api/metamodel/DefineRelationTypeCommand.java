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
    boolean hierarchical) {}
