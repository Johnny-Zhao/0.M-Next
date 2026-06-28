package com.mnext.engines.rules;

public sealed interface RuleExpression
    permits Literal,
        SelfRef,
        FieldRef,
        Comparison,
        Logical,
        Not,
        FunctionCall,
        Traverse,
        TraverseFrom,
        TraverseDeep,
        OclIteration,
        Aggregate,
        Arithmetic,
        Conditional {}
