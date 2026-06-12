package com.mnext.kernel.api.events;

public record StateChanged(String targetType, String targetId, String fromState, String toState) {}
