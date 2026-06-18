package com.mnext.engines.rules;

import java.math.BigDecimal;
import java.math.MathContext;
import java.util.ArrayList;
import java.util.List;

public final class RuleEvaluator {
  public static final int DEFAULT_MAX_DEPTH = 64;
  public static final int DEFAULT_MAX_STEPS = 512;
  public static final int DEFAULT_MAX_RELATION_CALLS = 16;
  public static final int DEFAULT_MAX_TRAVERSAL_DEPTH = 32;
  public static final int DEFAULT_MAX_TRAVERSED_NODES = 256;
  private final int maxDepth;
  private final int maxSteps;
  private final int maxRelationCalls;
  private final int maxTraversalDepth;
  private final int maxTraversedNodes;

  public RuleEvaluator() {
    this(DEFAULT_MAX_DEPTH, DEFAULT_MAX_STEPS);
  }

  public RuleEvaluator(int maxDepth, int maxSteps) {
    this(maxDepth, maxSteps, DEFAULT_MAX_RELATION_CALLS);
  }

  public RuleEvaluator(int maxDepth, int maxSteps, int maxRelationCalls) {
    this(
        maxDepth,
        maxSteps,
        maxRelationCalls,
        DEFAULT_MAX_TRAVERSAL_DEPTH,
        DEFAULT_MAX_TRAVERSED_NODES);
  }

  public RuleEvaluator(
      int maxDepth,
      int maxSteps,
      int maxRelationCalls,
      int maxTraversalDepth,
      int maxTraversedNodes) {
    this.maxDepth = maxDepth;
    this.maxSteps = maxSteps;
    this.maxRelationCalls = maxRelationCalls;
    this.maxTraversalDepth = maxTraversalDepth;
    this.maxTraversedNodes = maxTraversedNodes;
  }

  public boolean evaluate(RuleExpression expression, EvalContext context) {
    var value = evaluateValue(expression, context);
    if (!(value instanceof Boolean result)) {
      throw new RuleSyntaxException("expression must evaluate to boolean", 0);
    }
    return result;
  }

  public Object evaluateValue(RuleExpression expression, EvalContext context) {
    return eval(expression, context, new State(), 1);
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
      case Traverse traverse -> evalTraverse(context, traverse.relType(), traverse.dir(), state);
      case TraverseFrom traverseFrom -> evalTraverseFrom(traverseFrom, context, state, depth);
      case TraverseDeep traverseDeep -> evalTraverseDeep(traverseDeep, context, state, depth);
      case Aggregate aggregate -> evalAggregate(aggregate, context, state, depth);
      case Arithmetic arithmetic -> evalArithmetic(arithmetic, context, state, depth);
      case Conditional conditional -> evalConditional(conditional, context, state, depth);
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

  private List<EvalContext> evalTraverse(
      EvalContext context, String relType, String dir, State state) {
    return collect(context.traverse(relType, dir), state);
  }

  private List<EvalContext> evalTraverseFrom(
      TraverseFrom traverseFrom, EvalContext context, State state, int depth) {
    var sources = contexts(eval(traverseFrom.source(), context, state, depth + 1));
    var result = new ArrayList<EvalContext>();
    for (var source : sources) {
      result.addAll(collect(source.traverse(traverseFrom.relType(), traverseFrom.dir()), state));
    }
    return result;
  }

  private List<EvalContext> evalTraverseDeep(
      TraverseDeep traverseDeep, EvalContext context, State state, int depth) {
    var requestedDepth = intValue(eval(traverseDeep.maxDepth(), context, state, depth + 1));
    if (requestedDepth < 0 || requestedDepth > maxTraversalDepth) {
      throw new RuleEvalLimitException("traverseDeep depth exceeds limit");
    }
    var result = new ArrayList<EvalContext>();
    var frontier = List.of(context);
    for (var index = 0; index < requestedDepth; index++) {
      var next = new ArrayList<EvalContext>();
      for (var source : frontier) {
        next.addAll(collect(source.traverse(traverseDeep.relType(), traverseDeep.dir()), state));
      }
      result.addAll(next);
      frontier = next;
      if (frontier.isEmpty()) {
        break;
      }
    }
    return result;
  }

  private Object evalAggregate(Aggregate aggregate, EvalContext context, State state, int depth) {
    var contexts = contexts(eval(aggregate.source(), context, state, depth + 1));
    return switch (aggregate.operator()) {
      case COUNT -> contexts.size();
      case ANY -> evalAny(contexts, aggregate.predicate(), state, depth);
      case ALL -> evalAll(contexts, aggregate.predicate(), state, depth);
      case SUM -> sum(contexts, aggregate.field());
      case AVG -> average(contexts, aggregate.field());
      case MAX -> extremum(contexts, aggregate.field(), true);
      case MIN -> extremum(contexts, aggregate.field(), false);
    };
  }

  private BigDecimal evalArithmetic(
      Arithmetic arithmetic, EvalContext context, State state, int depth) {
    var left = number(eval(arithmetic.left(), context, state, depth + 1));
    var right = number(eval(arithmetic.right(), context, state, depth + 1));
    return switch (arithmetic.operator()) {
      case ADD -> left.add(right);
      case SUBTRACT -> left.subtract(right);
      case MULTIPLY -> left.multiply(right);
      case DIVIDE -> divide(left, right);
    };
  }

  private Object evalConditional(
      Conditional conditional, EvalContext context, State state, int depth) {
    return asBoolean(eval(conditional.condition(), context, state, depth + 1))
        ? eval(conditional.ifTrue(), context, state, depth + 1)
        : eval(conditional.ifFalse(), context, state, depth + 1);
  }

  private List<EvalContext> collect(Iterable<EvalContext> values, State state) {
    var result = new ArrayList<EvalContext>();
    for (var value : values) {
      state.traversedNodes++;
      if (state.traversedNodes > maxTraversedNodes) {
        throw new RuleEvalLimitException("traversed nodes exceed limit");
      }
      result.add(value);
    }
    return result;
  }

  @SuppressWarnings("unchecked")
  private List<EvalContext> contexts(Object value) {
    if (value instanceof List<?> list) {
      for (var item : list) {
        if (!(item instanceof EvalContext)) {
          throw new RuleSyntaxException("context set expected", 0);
        }
      }
      return (List<EvalContext>) list;
    }
    throw new RuleSyntaxException("context set expected", 0);
  }

  private boolean evalAny(
      List<EvalContext> contexts, RuleExpression predicate, State state, int depth) {
    for (var context : contexts) {
      if (asBoolean(eval(predicate, context, state, depth + 1))) {
        return true;
      }
    }
    return false;
  }

  private boolean evalAll(
      List<EvalContext> contexts, RuleExpression predicate, State state, int depth) {
    for (var context : contexts) {
      if (!asBoolean(eval(predicate, context, state, depth + 1))) {
        return false;
      }
    }
    return true;
  }

  private BigDecimal sum(List<EvalContext> contexts, String field) {
    var result = BigDecimal.ZERO;
    for (var context : contexts) {
      var value = RuleFunctions.toNumber(context.fieldValue(field));
      if (value != null) {
        result = result.add(value);
      }
    }
    return result;
  }

  private Object average(List<EvalContext> contexts, String field) {
    var result = BigDecimal.ZERO;
    var count = 0;
    for (var context : contexts) {
      var value = RuleFunctions.toNumber(context.fieldValue(field));
      if (value != null) {
        result = result.add(value);
        count++;
      }
    }
    return count == 0 ? null : result.divide(BigDecimal.valueOf(count), MathContext.DECIMAL128);
  }

  private Object extremum(List<EvalContext> contexts, String field, boolean maximum) {
    BigDecimal result = null;
    for (var context : contexts) {
      var value = RuleFunctions.toNumber(context.fieldValue(field));
      if (value != null
          && (result == null
              || (maximum ? value.compareTo(result) > 0 : value.compareTo(result) < 0))) {
        result = value;
      }
    }
    return result;
  }

  private BigDecimal number(Object value) {
    var number = RuleFunctions.toNumber(value);
    if (number == null) {
      throw new RuleSyntaxException("numeric value expected", 0);
    }
    return number;
  }

  private int intValue(Object value) {
    try {
      return number(value).intValueExact();
    } catch (ArithmeticException exception) {
      throw new RuleSyntaxException("integer value expected", 0);
    }
  }

  private BigDecimal divide(BigDecimal left, BigDecimal right) {
    if (BigDecimal.ZERO.compareTo(right) == 0) {
      throw new RuleSyntaxException("division by zero", 0);
    }
    return left.divide(right, MathContext.DECIMAL128);
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
    private int traversedNodes;
  }
}
