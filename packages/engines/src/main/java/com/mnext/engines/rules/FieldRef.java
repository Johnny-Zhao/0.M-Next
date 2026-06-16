package com.mnext.engines.rules;

public record FieldRef(String code) implements RuleExpression {
  public FieldRef {
    if (code == null || code.isBlank()) {
      throw new IllegalArgumentException("field code must not be blank");
    }
  }
}
