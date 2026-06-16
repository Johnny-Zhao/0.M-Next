package com.mnext.engines.rules;

public sealed interface RuleExpression
    permits Literal, FieldRef, Comparison, Logical, Not, FunctionCall {}
