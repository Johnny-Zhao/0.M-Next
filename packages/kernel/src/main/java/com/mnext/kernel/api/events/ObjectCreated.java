package com.mnext.kernel.api.events;

import java.util.UUID;

public record ObjectCreated(UUID objectId, UUID objectTypeId, String status) {}
