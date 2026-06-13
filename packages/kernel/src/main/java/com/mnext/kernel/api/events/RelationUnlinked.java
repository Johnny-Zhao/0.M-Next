package com.mnext.kernel.api.events;

import java.util.UUID;

public record RelationUnlinked(
    UUID relationId, UUID relationTypeId, UUID sourceId, UUID targetId, String reason) {}
