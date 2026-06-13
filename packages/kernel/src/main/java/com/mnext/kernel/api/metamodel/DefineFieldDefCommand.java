package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record DefineFieldDefCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID objectTypeId,
    String code,
    String name,
    DataType dataType,
    boolean required,
    FieldConstraints constraints) {}
