package com.mnext.engines.rules;

import java.util.List;

public record FunctionCall(String name, List<RuleExpression> arguments) implements RuleExpression {
  public FunctionCall {
    arguments = List.copyOf(arguments);
  }
}
