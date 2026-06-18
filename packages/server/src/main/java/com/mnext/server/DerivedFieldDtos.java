package com.mnext.server;

import java.util.UUID;

record DefineDerivedFieldRequest(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID templateVersionId,
    UUID objectTypeId,
    String code,
    String name,
    String resultType,
    String derivation) {}
