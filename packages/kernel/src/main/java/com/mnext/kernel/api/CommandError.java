package com.mnext.kernel.api;

import java.util.Map;

public record CommandError(
    String code, String message, Map<String, Object> details, String suggestion) {}
