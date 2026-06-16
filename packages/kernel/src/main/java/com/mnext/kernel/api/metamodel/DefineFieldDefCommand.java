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
    String valueTypeCode,
    boolean required,
    String redefinesFieldCode,
    FieldConstraints constraints) {
  public DefineFieldDefCommand(
      UUID workspaceId,
      UUID correlationId,
      String idempotencyKey,
      UUID objectTypeId,
      String code,
      String name,
      DataType dataType,
      boolean required,
      FieldConstraints constraints) {
    this(
        workspaceId,
        correlationId,
        idempotencyKey,
        objectTypeId,
        code,
        name,
        dataType,
        null,
        required,
        null,
        constraints);
  }

  public DefineFieldDefCommand(
      UUID workspaceId,
      UUID correlationId,
      String idempotencyKey,
      UUID objectTypeId,
      String code,
      String name,
      DataType dataType,
      String valueTypeCode,
      boolean required,
      FieldConstraints constraints) {
    this(
        workspaceId,
        correlationId,
        idempotencyKey,
        objectTypeId,
        code,
        name,
        dataType,
        valueTypeCode,
        required,
        null,
        constraints);
  }
}
