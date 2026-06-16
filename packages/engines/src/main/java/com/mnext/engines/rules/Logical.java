package com.mnext.engines.rules;

public record Logical(RuleExpression left, Operator operator, RuleExpression right)
    implements RuleExpression {
  public enum Operator {
    AND,
    OR
  }
}
