package com.mnext.kernel.internal;

import java.time.Instant;
import java.util.UUID;

record FieldValueRow(
    UUID fieldDefId,
    String code,
    String valueJson,
    long version,
    String updatedBy,
    Instant updatedAt) {}
