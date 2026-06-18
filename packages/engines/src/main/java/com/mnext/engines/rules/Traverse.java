package com.mnext.engines.rules;

public record Traverse(String relType, String dir) implements RuleExpression {}
