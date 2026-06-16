package com.mnext.engines.rules;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

public final class RuleFunctions {
  public static final int MAX_REGEX_PATTERN_LENGTH = 128;
  public static final int MAX_REGEX_INPUT_LENGTH = 512;
  private static final Set<String> ALLOWED =
      Set.of(
          "isBlank",
          "length",
          "matches",
          "toNumber",
          "inSet",
          "coalesce",
          "relationCount",
          "hasRelation");

  private RuleFunctions() {}

  public static boolean isAllowed(String name) {
    return ALLOWED.contains(name);
  }

  static Object invoke(String name, List<Object> args, EvalContext context) {
    return switch (name) {
      case "isBlank" -> isBlank(one(name, args));
      case "length" -> length(one(name, args));
      case "matches" -> matches(two(name, args).first(), two(name, args).second());
      case "toNumber" -> toNumber(one(name, args));
      case "inSet" -> inSet(args);
      case "coalesce" -> coalesce(args);
      case "relationCount" -> context.relationCount(stringArg(name, one(name, args)));
      case "hasRelation" -> context.hasRelation(stringArg(name, one(name, args)));
      default -> throw new RuleSyntaxException("unknown function " + name, 0);
    };
  }

  static BigDecimal toNumber(Object value) {
    if (value == null || value instanceof Boolean) {
      return null;
    }
    try {
      return new BigDecimal(String.valueOf(value).trim());
    } catch (NumberFormatException exception) {
      return null;
    }
  }

  static boolean sameValue(Object left, Object right) {
    var leftNumber = toNumber(left);
    var rightNumber = toNumber(right);
    if (leftNumber != null && rightNumber != null) {
      return leftNumber.compareTo(rightNumber) == 0;
    }
    return left == null ? right == null : left.equals(right);
  }

  private static boolean isBlank(Object value) {
    return value == null || String.valueOf(value).isBlank();
  }

  private static int length(Object value) {
    return value == null ? 0 : String.valueOf(value).length();
  }

  private static boolean matches(Object value, Object patternValue) {
    var input = value == null ? "" : String.valueOf(value);
    var pattern = stringArg("matches", patternValue);
    if (input.length() > MAX_REGEX_INPUT_LENGTH || pattern.length() > MAX_REGEX_PATTERN_LENGTH) {
      throw new RuleEvalLimitException("regex input or pattern length exceeds limit");
    }
    try {
      return Pattern.compile(pattern).matcher(input).matches();
    } catch (PatternSyntaxException exception) {
      throw new RuleSyntaxException("invalid regex pattern", 0);
    }
  }

  private static boolean inSet(List<Object> args) {
    if (args.size() < 2) {
      throw new RuleSyntaxException("inSet expects at least 2 arguments", 0);
    }
    var value = args.getFirst();
    for (var index = 1; index < args.size(); index++) {
      if (sameValue(value, args.get(index))) {
        return true;
      }
    }
    return false;
  }

  private static Object coalesce(List<Object> args) {
    if (args.isEmpty()) {
      throw new RuleSyntaxException("coalesce expects at least 1 argument", 0);
    }
    for (var value : args) {
      if (value != null) {
        return value;
      }
    }
    return null;
  }

  private static Object one(String name, List<Object> args) {
    if (args.size() != 1) {
      throw new RuleSyntaxException(name + " expects 1 argument", 0);
    }
    return args.getFirst();
  }

  private static Pair two(String name, List<Object> args) {
    if (args.size() != 2) {
      throw new RuleSyntaxException(name + " expects 2 arguments", 0);
    }
    return new Pair(args.get(0), args.get(1));
  }

  private static String stringArg(String name, Object value) {
    if (!(value instanceof String string) || string.isBlank()) {
      throw new RuleSyntaxException(name + " expects a non-blank string", 0);
    }
    return string;
  }

  private record Pair(Object first, Object second) {}
}
