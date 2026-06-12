package com.mnext.kernel.api.events;

import java.util.Map;
import java.util.UUID;

public record RelationCreated(
    UUID relationId,
    UUID relationTypeId,
    UUID sourceId,
    UUID targetId,
    Map<String, Object> fields) {}
