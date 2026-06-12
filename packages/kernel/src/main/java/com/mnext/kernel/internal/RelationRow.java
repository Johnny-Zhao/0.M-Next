package com.mnext.kernel.internal;

import java.util.UUID;

record RelationRow(
    UUID id,
    UUID relationTypeId,
    UUID sourceId,
    UUID targetId,
    String fieldsJson,
    String status,
    long version) {}
