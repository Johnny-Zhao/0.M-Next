package com.mnext.server;

import java.util.UUID;

record AttachFileRequest(
    UUID workspaceId,
    UUID correlationId,
    String idempotencyKey,
    UUID objectId,
    String filename,
    String contentType,
    long sizeBytes,
    String sha256,
    String storageKey) {}

record DetachFileRequest(
    UUID workspaceId, UUID correlationId, String idempotencyKey, UUID attachmentId) {}

record BlobUploadResponse(String storageKey, String sha256, long sizeBytes, String contentType) {}
