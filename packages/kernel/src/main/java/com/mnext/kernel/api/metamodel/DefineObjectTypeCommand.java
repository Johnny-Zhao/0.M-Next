package com.mnext.kernel.api.metamodel;

import java.util.UUID;

public record DefineObjectTypeCommand(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID templateVersionId,
    String code,
    String name,
    String parentTypeCode) {
  public DefineObjectTypeCommand(
      UUID workspaceId,
      UUID correlationId,
      String idempotencyKey,
      UUID templateVersionId,
      String code,
      String name) {
    this(workspaceId, correlationId, idempotencyKey, templateVersionId, code, name, null);
  }
}
