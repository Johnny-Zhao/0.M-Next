package com.mnext.engines.rules;

public record Comparison(RuleExpression left, Operator operator, RuleExpression right)
    implements RuleExpression {
  public enum Operator {
    EQ,
    NE,
    LT,
    LE,
    GT,
    GE
  }
}
