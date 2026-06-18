package com.mnext.engines.rules;

public record Arithmetic(RuleExpression left, Operator operator, RuleExpression right)
    implements RuleExpression {
  public enum Operator {
    ADD,
    SUBTRACT,
    MULTIPLY,
    DIVIDE
  }
}
