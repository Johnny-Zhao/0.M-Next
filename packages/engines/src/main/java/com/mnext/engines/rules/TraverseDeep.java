package com.mnext.engines.rules;

public record TraverseDeep(String relType, String dir, RuleExpression maxDepth)
    implements RuleExpression {}
