package com.mnext.kernel.api.events;

import java.util.List;
import java.util.UUID;

public record ObjectUpdated(UUID objectId, List<String> changedFields, long objectVersion) {}
