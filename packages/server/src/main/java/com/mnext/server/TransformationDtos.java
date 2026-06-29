package com.mnext.server;

import java.util.List;
import java.util.UUID;

record DefineTransformationRequest(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID templateVersionId,
    String code,
    String name,
    String correspondenceRelationCode,
    List<ObjectMapping> objectMappings,
    List<RelationMapping> relationMappings) {}

record RunTransformationRequest(
    UUID workspaceId, UUID correlationId, String idempotencyKey, String transformationCode) {}

record ObjectMapping(
    String sourceTypeCode,
    String targetTypeCode,
    String cardinality,
    String direction,
    List<FieldMapping> fieldMappings) {}

record FieldMapping(String targetFieldCode, String expression) {}

record RelationMapping(String sourceRelationCode, String targetRelationCode) {}
