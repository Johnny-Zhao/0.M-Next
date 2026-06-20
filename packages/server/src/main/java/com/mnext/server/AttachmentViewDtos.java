package com.mnext.server;

import java.time.Instant;
import java.util.UUID;

record AttachmentView(
    UUID id,
    UUID objectId,
    String filename,
    String contentType,
    long sizeBytes,
    String sha256,
    String status,
    String createdBy,
    Instant createdAt) {}

record AttachmentContent(
    UUID id, String filename, String contentType, long sizeBytes, String storageKey) {}
