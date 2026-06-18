package com.mnext.engines.rules;

public record Conditional(RuleExpression condition, RuleExpression ifTrue, RuleExpression ifFalse)
    implements RuleExpression {}
