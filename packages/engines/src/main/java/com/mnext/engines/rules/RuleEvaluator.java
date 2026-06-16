package com.mnext.engines.rules;

import java.util.ArrayList;

public final class RuleEvaluator {
  public static final int DEFAULT_MAX_DEPTH = 64;
  public static final int DEFAULT_MAX_STEPS = 512;
  public static final int DEFAULT_MAX_RELATION_CALLS = 16;
  private final int maxDepth;
  private final int maxSteps;
  private final int maxRelationCalls;

  public RuleEvaluator() {
    this(DEFAULT_MAX_DEPTH, DEFAULT_MAX_STEPS);
  }

  public RuleEvaluator(int maxDepth, int maxSteps) {
    this(maxDepth, maxSteps, DEFAULT_MAX_RELATION_CALLS);
  }

  public RuleEvaluator(int maxDepth, int maxSteps, int maxRelationCalls) {
    this.maxDepth = maxDepth;
    this.maxSteps = maxSteps;
    this.maxRelationCalls = maxRelationCalls;
  }

  public boolean evaluate(RuleExpression expression, EvalContext context) {
    var state = new State();
    var value = eval(expression, context, state, 1);
    if (!(value instanceof Boolean result)) {
      throw new RuleSyntaxException("expression must evaluate to boolean", 0);
    }
    return result;
  }

  private Object eval(RuleExpression expression, EvalContext context, State state, int depth) {
    enter(state, depth);
    return switch (expression) {
      case Literal literal -> literal.value();
      case FieldRef fieldRef -> context.fieldValue(fieldRef.code());
      case Comparison comparison -> evalComparison(comparison, context, state, depth);
      case Logical logical -> evalLogical(logical, context, state, depth);
      case Not not -> !asBoolean(eval(not.expression(), context, state, depth + 1));
      case FunctionCall functionCall -> evalFunction(functionCall, context, state, depth);
    };
  }

  private boolean evalLogical(Logical logical, EvalContext context, State state, int depth) {
    if (logical.operator() == Logical.Operator.AND) {
      return asBoolean(eval(logical.left(), context, state, depth + 1))
          && asBoolean(eval(logical.right(), context, state, depth + 1));
    }
    return asBoolean(eval(logical.left(), context, state, depth + 1))
        || asBoolean(eval(logical.right(), context, state, depth + 1));
  }

  private boolean evalComparison(
      Comparison comparison, EvalContext context, State state, int depth) {
    var left = eval(comparison.left(), context, state, depth + 1);
    var right = eval(comparison.right(), context, state, depth + 1);
    return switch (comparison.operator()) {
      case EQ -> RuleFunctions.sameValue(left, right);
      case NE -> !RuleFunctions.sameValue(left, right);
      case LT -> compare(left, right) < 0;
      case LE -> compare(left, right) <= 0;
      case GT -> compare(left, right) > 0;
      case GE -> compare(left, right) >= 0;
    };
  }

  private Object evalFunction(
      FunctionCall functionCall, EvalContext context, State state, int depth) {
    if (!RuleFunctions.isAllowed(functionCall.name())) {
      throw new RuleSyntaxException("unknown function " + functionCall.name(), 0);
    }
    checkRelationCallLimit(functionCall.name(), state);
    var values = new ArrayList<Object>();
    for (var argument : functionCall.arguments()) {
      values.add(eval(argument, context, state, depth + 1));
    }
    return RuleFunctions.invoke(functionCall.name(), values, context);
  }

  private int compare(Object left, Object right) {
    var leftNumber = RuleFunctions.toNumber(left);
    var rightNumber = RuleFunctions.toNumber(right);
    if (leftNumber != null && rightNumber != null) {
      return leftNumber.compareTo(rightNumber);
    }
    if (left instanceof String leftString && right instanceof String rightString) {
      return leftString.compareTo(rightString);
    }
    throw new RuleSyntaxException("values are not comparable", 0);
  }

  private boolean asBoolean(Object value) {
    if (value instanceof Boolean booleanValue) {
      return booleanValue;
    }
    throw new RuleSyntaxException("boolean value expected", 0);
  }

  private void enter(State state, int depth) {
    if (depth > maxDepth) {
      throw new RuleEvalLimitException("expression depth exceeds limit");
    }
    state.steps++;
    if (state.steps > maxSteps) {
      throw new RuleEvalLimitException("evaluation steps exceed limit");
    }
  }

  private void checkRelationCallLimit(String name, State state) {
    if (!"relationCount".equals(name) && !"hasRelation".equals(name)) {
      return;
    }
    state.relationCalls++;
    if (state.relationCalls > maxRelationCalls) {
      throw new RuleEvalLimitException("relation function calls exceed limit");
    }
  }

  private static final class State {
    private int steps;
    private int relationCalls;
  }
}
