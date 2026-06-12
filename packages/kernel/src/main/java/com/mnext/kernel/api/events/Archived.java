package com.mnext.kernel.api.events;

public record Archived(String targetType, String targetId, String reason) {}
