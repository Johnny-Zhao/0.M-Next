package com.mnext.engines.rules;

public record Aggregate(
    Operator operator, RuleExpression source, String field, RuleExpression predicate)
    implements RuleExpression {
  public enum Operator {
    SUM,
    AVG,
    MAX,
    MIN,
    COUNT,
    ANY,
    ALL
  }
}
