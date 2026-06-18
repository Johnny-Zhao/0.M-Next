package com.mnext.engines.rules;

public record TraverseFrom(RuleExpression source, String relType, String dir)
    implements RuleExpression {}
