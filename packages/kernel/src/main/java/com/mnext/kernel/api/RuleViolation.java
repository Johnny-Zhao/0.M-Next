package com.mnext.kernel.api;

public record RuleViolation(String ruleCode, String severity, String message) {}
