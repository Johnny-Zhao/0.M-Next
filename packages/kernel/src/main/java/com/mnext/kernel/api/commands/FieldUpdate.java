package com.mnext.kernel.api.commands;

public record FieldUpdate(String fieldDefCode, Object value, Long expectedFieldVersion) {}
