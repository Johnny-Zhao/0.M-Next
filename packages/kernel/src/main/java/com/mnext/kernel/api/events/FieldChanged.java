package com.mnext.kernel.api.events;

import java.util.UUID;

public record FieldChanged(
    UUID objectId, String fieldDefCode, Object before, Object after, long fieldVersion) {}
