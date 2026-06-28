package com.mnext.engines.rules;

public record OclIteration(
    RuleExpression source, Operator operator, String variable, RuleExpression expression)
    implements RuleExpression {
  public OclIteration {
    if (source == null) {
      throw new IllegalArgumentException("source must not be null");
    }
    if (operator == null) {
      throw new IllegalArgumentException("operator must not be null");
    }
  }

  public enum Operator {
    SELECT,
    REJECT,
    COLLECT,
    FOR_ALL,
    EXISTS,
    IS_EMPTY,
    SIZE,
    SUM,
    INCLUDES
  }
}
