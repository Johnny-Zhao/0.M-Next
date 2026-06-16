package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record DefineValueTypeCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID templateVersionId,
    String code,
    String name,
    DataType basePrimitive,
    String parentValueTypeCode,
    FieldConstraints constraints) {}
