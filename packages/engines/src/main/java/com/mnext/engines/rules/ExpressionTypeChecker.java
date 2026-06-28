package com.mnext.engines.rules;

import java.util.HashMap;
import java.util.Map;

public final class ExpressionTypeChecker {
  private final Model model;

  public ExpressionTypeChecker(Model model) {
    this.model = model;
  }

  public Type check(RuleExpression expression, String rootType) {
    return infer(expression, rootType);
  }

  public void requireBoolean(RuleExpression expression, String rootType) {
    var type = check(expression, rootType);
    if (type.kind() != Kind.BOOLEAN && type.kind() != Kind.ANY) {
      throw new RuleSyntaxException("expression must be boolean, got " + type.kind(), 0);
    }
  }

  private Type infer(RuleExpression expression, String objectType) {
    return switch (expression) {
      case Literal literal -> literalType(literal.value());
      case SelfRef ignored -> Type.object(objectType);
      case FieldRef fieldRef -> model.fieldType(objectType, fieldRef.code());
      case Traverse traverse ->
          Type.collection(model.relationTarget(objectType, traverse.relType()));
      case TraverseFrom traverseFrom -> {
        var source = infer(traverseFrom.source(), objectType);
        yield Type.collection(model.relationTarget(source.elementType(), traverseFrom.relType()));
      }
      case TraverseDeep traverseDeep -> {
        requireNumber(infer(traverseDeep.maxDepth(), objectType), "traverseDeep depth");
        yield Type.collection(model.relationTarget(objectType, traverseDeep.relType()));
      }
      case Comparison comparison -> {
        var left = infer(comparison.left(), objectType);
        var right = infer(comparison.right(), objectType);
        if (comparison.operator() != Comparison.Operator.EQ
            && comparison.operator() != Comparison.Operator.NE
            && !comparable(left, right)) {
          throw new RuleSyntaxException("comparison requires comparable operands", 0);
        }
        yield Type.BOOLEAN;
      }
      case Logical logical -> {
        requireBooleanType(infer(logical.left(), objectType), "logical left");
        requireBooleanType(infer(logical.right(), objectType), "logical right");
        yield Type.BOOLEAN;
      }
      case Not not -> {
        requireBooleanType(infer(not.expression(), objectType), "not");
        yield Type.BOOLEAN;
      }
      case Arithmetic arithmetic -> {
        requireNumber(infer(arithmetic.left(), objectType), "arithmetic left");
        requireNumber(infer(arithmetic.right(), objectType), "arithmetic right");
        yield Type.NUMBER;
      }
      case Conditional conditional -> {
        requireBooleanType(infer(conditional.condition(), objectType), "condition");
        infer(conditional.ifTrue(), objectType);
        yield infer(conditional.ifFalse(), objectType);
      }
      case FunctionCall functionCall -> functionType(functionCall);
      case Aggregate aggregate -> aggregateType(aggregate, objectType);
      case OclIteration iteration -> iterationType(iteration, objectType);
    };
  }

  private Type aggregateType(Aggregate aggregate, String objectType) {
    var source = infer(aggregate.source(), objectType);
    var elementType = source.elementType();
    return switch (aggregate.operator()) {
      case COUNT -> Type.NUMBER;
      case ANY, ALL -> {
        requireBooleanType(infer(aggregate.predicate(), elementType), "aggregate predicate");
        yield Type.BOOLEAN;
      }
      case SUM, AVG, MAX, MIN -> {
        requireNumber(model.fieldType(elementType, aggregate.field()), "aggregate field");
        yield Type.NUMBER;
      }
    };
  }

  private Type iterationType(OclIteration iteration, String objectType) {
    var source = infer(iteration.source(), objectType);
    var elementType = source.elementType();
    return switch (iteration.operator()) {
      case SELECT, REJECT -> {
        requireBooleanType(infer(iteration.expression(), elementType), "iterator predicate");
        yield source;
      }
      case COLLECT -> Type.collection(infer(iteration.expression(), elementType));
      case FOR_ALL, EXISTS -> {
        requireBooleanType(infer(iteration.expression(), elementType), "iterator predicate");
        yield Type.BOOLEAN;
      }
      case IS_EMPTY -> Type.BOOLEAN;
      case SIZE -> Type.NUMBER;
      case SUM -> {
        if (source.element() != Kind.NUMBER) {
          throw new RuleSyntaxException("sum requires numeric collection", 0);
        }
        yield Type.NUMBER;
      }
      case INCLUDES -> Type.BOOLEAN;
    };
  }

  private Type functionType(FunctionCall functionCall) {
    return switch (functionCall.name()) {
      case "isBlank", "matches", "inSet", "hasRelation" -> Type.BOOLEAN;
      case "length", "toNumber", "interp", "lookup", "relationCount" -> Type.NUMBER;
      case "coalesce" -> Type.ANY;
      default -> throw new RuleSyntaxException("unknown function " + functionCall.name(), 0);
    };
  }

  private Type literalType(Object value) {
    if (value instanceof Boolean) return Type.BOOLEAN;
    if (value instanceof Number) return Type.NUMBER;
    if (value instanceof String) return Type.STRING;
    return Type.ANY;
  }

  private boolean comparable(Type left, Type right) {
    return left.kind() == Kind.ANY
        || right.kind() == Kind.ANY
        || (left.kind() == Kind.NUMBER && right.kind() == Kind.NUMBER)
        || (left.kind() == Kind.STRING && right.kind() == Kind.STRING);
  }

  private void requireBooleanType(Type type, String label) {
    if (type.kind() != Kind.BOOLEAN && type.kind() != Kind.ANY) {
      throw new RuleSyntaxException(label + " must be boolean", 0);
    }
  }

  private void requireNumber(Type type, String label) {
    if (type.kind() != Kind.NUMBER && type.kind() != Kind.ANY) {
      throw new RuleSyntaxException(label + " must be numeric", 0);
    }
  }

  public enum Kind {
    ANY,
    BOOLEAN,
    NUMBER,
    STRING,
    OBJECT,
    COLLECTION
  }

  public record Type(Kind kind, String objectType, Kind element, String elementType) {
    public static final Type ANY = new Type(Kind.ANY, null, Kind.ANY, null);
    public static final Type BOOLEAN = new Type(Kind.BOOLEAN, null, null, null);
    public static final Type NUMBER = new Type(Kind.NUMBER, null, null, null);
    public static final Type STRING = new Type(Kind.STRING, null, null, null);

    public static Type object(String objectType) {
      return new Type(Kind.OBJECT, objectType, null, null);
    }

    public static Type collection(String elementType) {
      return new Type(Kind.COLLECTION, null, Kind.OBJECT, elementType);
    }

    public static Type collection(Type element) {
      return new Type(Kind.COLLECTION, null, element.kind(), element.objectType());
    }
  }

  public static final class Model {
    private final Map<String, Map<String, Type>> fields = new HashMap<>();
    private final Map<String, Map<String, String>> relations = new HashMap<>();

    public Model field(String objectType, String field, String dataType) {
      fields.computeIfAbsent(objectType, ignored -> new HashMap<>()).put(field, scalar(dataType));
      return this;
    }

    public Model relation(String sourceType, String code, String targetType) {
      relations.computeIfAbsent(sourceType, ignored -> new HashMap<>()).put(code, targetType);
      return this;
    }

    private Type fieldType(String objectType, String field) {
      var type = fields.getOrDefault(objectType, Map.of()).get(field);
      if (type == null) {
        throw new RuleSyntaxException("unknown field " + objectType + "." + field, 0);
      }
      return type;
    }

    private String relationTarget(String objectType, String relation) {
      var target = relations.getOrDefault(objectType, Map.of()).get(relation);
      if (target == null) {
        throw new RuleSyntaxException("unknown relation " + objectType + "." + relation, 0);
      }
      return target;
    }

    private Type scalar(String dataType) {
      if ("boolean".equals(dataType)) return Type.BOOLEAN;
      if ("number".equals(dataType)
          || "decimal".equals(dataType)
          || "integer".equals(dataType)
          || "int".equals(dataType)) {
        return Type.NUMBER;
      }
      if ("string".equals(dataType) || "text".equals(dataType)) return Type.STRING;
      return Type.ANY;
    }
  }
}
