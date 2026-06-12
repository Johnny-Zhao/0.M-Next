package com.mnext.kernel.api.events;

public record SoftDeleted(String targetType, String targetId, String reason) {}
