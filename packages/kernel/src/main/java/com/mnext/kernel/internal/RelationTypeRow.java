package com.mnext.kernel.internal;

import java.util.UUID;

record RelationTypeRow(
    UUID id,
    UUID sourceType,
    UUID targetType,
    String direction,
    String cardinality,
    String semantics,
    boolean hierarchical) {}
