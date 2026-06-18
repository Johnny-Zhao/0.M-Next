package com.mnext.engines.rules;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public final class RuleParser {
  public static final int MAX_SOURCE_LENGTH = 2000;
  private final String source;
  private int position;

  private RuleParser(String source) {
    this.source = source;
  }

  public static RuleExpression parse(String source) {
    if (source == null || source.isBlank()) {
      throw new RuleSyntaxException("expression must not be blank", 0);
    }
    if (source.length() > MAX_SOURCE_LENGTH) {
      throw new RuleSyntaxException("expression is too long", MAX_SOURCE_LENGTH);
    }
    var parser = new RuleParser(source);
    var expression = parser.parseOr();
    parser.skipWhitespace();
    if (!parser.isAtEnd()) {
      throw parser.error("unexpected token");
    }
    return expression;
  }

  private RuleExpression parseOr() {
    var expression = parseAnd();
    while (match("||")) {
      expression = new Logical(expression, Logical.Operator.OR, parseAnd());
    }
    return expression;
  }

  private RuleExpression parseAnd() {
    var expression = parseUnary();
    while (match("&&")) {
      expression = new Logical(expression, Logical.Operator.AND, parseUnary());
    }
    return expression;
  }

  private RuleExpression parseUnary() {
    if (match("!")) {
      return new Not(parseUnary());
    }
    return parseComparison();
  }

  private RuleExpression parseComparison() {
    var expression = parseAdditive();
    var operator = comparisonOperator();
    if (operator == null) {
      return expression;
    }
    return new Comparison(expression, operator, parseAdditive());
  }

  private RuleExpression parseAdditive() {
    var expression = parseMultiplicative();
    while (true) {
      if (match("+")) {
        expression = new Arithmetic(expression, Arithmetic.Operator.ADD, parseMultiplicative());
      } else if (match("-")) {
        expression =
            new Arithmetic(expression, Arithmetic.Operator.SUBTRACT, parseMultiplicative());
      } else {
        return expression;
      }
    }
  }

  private RuleExpression parseMultiplicative() {
    var expression = parsePrimary();
    while (true) {
      if (match("*")) {
        expression = new Arithmetic(expression, Arithmetic.Operator.MULTIPLY, parsePrimary());
      } else if (match("/")) {
        expression = new Arithmetic(expression, Arithmetic.Operator.DIVIDE, parsePrimary());
      } else {
        return expression;
      }
    }
  }

  private RuleExpression parsePrimary() {
    skipWhitespace();
    if (match("(")) {
      var expression = parseOr();
      expect(")");
      return expression;
    }
    if (peek() == '\'') {
      return new Literal(parseString());
    }
    if (isDigit(peek()) || peek() == '-') {
      return new Literal(parseNumber());
    }
    if (isIdentifierStart(peek())) {
      var identifier = parseIdentifier();
      if ("true".equals(identifier)) {
        return new Literal(true);
      }
      if ("false".equals(identifier)) {
        return new Literal(false);
      }
      if ("null".equals(identifier)) {
        return new Literal(null);
      }
      return parseFunction(identifier);
    }
    throw error("expected expression");
  }

  private RuleExpression parseFunction(String name) {
    if (!RuleFunctions.isAllowed(name) && !isSpecialFunction(name)) {
      throw error("unknown function " + name);
    }
    expect("(");
    var arguments = parseArguments();
    expect(")");
    if ("field".equals(name)) {
      if (arguments.size() != 1 || !(arguments.getFirst() instanceof Literal literal)) {
        throw error("field expects one string literal");
      }
      if (!(literal.value() instanceof String code) || code.isBlank()) {
        throw error("field expects one string literal");
      }
      return new FieldRef(code);
    }
    if ("traverse".equals(name)) {
      expectArgumentCount(name, arguments, 2);
      return new Traverse(stringLiteral(name, arguments.get(0)), direction(name, arguments.get(1)));
    }
    if ("traverseFrom".equals(name)) {
      expectArgumentCount(name, arguments, 3);
      return new TraverseFrom(
          arguments.get(0),
          stringLiteral(name, arguments.get(1)),
          direction(name, arguments.get(2)));
    }
    if ("traverseDeep".equals(name)) {
      expectArgumentCount(name, arguments, 3);
      return new TraverseDeep(
          stringLiteral(name, arguments.get(0)),
          direction(name, arguments.get(1)),
          arguments.get(2));
    }
    if ("if".equals(name)) {
      expectArgumentCount(name, arguments, 3);
      return new Conditional(arguments.get(0), arguments.get(1), arguments.get(2));
    }
    var aggregate = aggregateOperator(name);
    if (aggregate != null) {
      return aggregate(name, aggregate, arguments);
    }
    return new FunctionCall(name, arguments);
  }

  private List<RuleExpression> parseArguments() {
    var arguments = new ArrayList<RuleExpression>();
    skipWhitespace();
    if (peek() == ')') {
      return arguments;
    }
    do {
      arguments.add(parseOr());
      skipWhitespace();
    } while (match(","));
    return arguments;
  }

  private RuleExpression aggregate(
      String name, Aggregate.Operator operator, List<RuleExpression> arguments) {
    if (operator == Aggregate.Operator.COUNT) {
      expectArgumentCount(name, arguments, 1);
      return new Aggregate(operator, arguments.getFirst(), null, null);
    }
    if (operator == Aggregate.Operator.ANY || operator == Aggregate.Operator.ALL) {
      expectArgumentCount(name, arguments, 2);
      return new Aggregate(operator, arguments.getFirst(), null, arguments.get(1));
    }
    expectArgumentCount(name, arguments, 2);
    return new Aggregate(
        operator, arguments.getFirst(), stringLiteral(name, arguments.get(1)), null);
  }

  private Aggregate.Operator aggregateOperator(String name) {
    return switch (name) {
      case "sum" -> Aggregate.Operator.SUM;
      case "avg" -> Aggregate.Operator.AVG;
      case "max" -> Aggregate.Operator.MAX;
      case "min" -> Aggregate.Operator.MIN;
      case "count" -> Aggregate.Operator.COUNT;
      case "any" -> Aggregate.Operator.ANY;
      case "all" -> Aggregate.Operator.ALL;
      default -> null;
    };
  }

  private boolean isSpecialFunction(String name) {
    return "field".equals(name)
        || "traverse".equals(name)
        || "traverseFrom".equals(name)
        || "traverseDeep".equals(name)
        || "if".equals(name)
        || aggregateOperator(name) != null;
  }

  private void expectArgumentCount(
      String name, List<RuleExpression> arguments, int expectedArguments) {
    if (arguments.size() != expectedArguments) {
      throw error(name + " expects " + expectedArguments + " arguments");
    }
  }

  private String stringLiteral(String name, RuleExpression expression) {
    if (!(expression instanceof Literal literal) || !(literal.value() instanceof String value)) {
      throw error(name + " expects string literal arguments");
    }
    if (value.isBlank()) {
      throw error(name + " expects non-blank string literal arguments");
    }
    return value;
  }

  private String direction(String name, RuleExpression expression) {
    var value = stringLiteral(name, expression);
    if (!"out".equals(value) && !"in".equals(value)) {
      throw error(name + " direction must be 'out' or 'in'");
    }
    return value;
  }

  private Comparison.Operator comparisonOperator() {
    if (match("==")) {
      return Comparison.Operator.EQ;
    }
    if (match("!=")) {
      return Comparison.Operator.NE;
    }
    if (match("<=")) {
      return Comparison.Operator.LE;
    }
    if (match(">=")) {
      return Comparison.Operator.GE;
    }
    if (match("<")) {
      return Comparison.Operator.LT;
    }
    if (match(">")) {
      return Comparison.Operator.GT;
    }
    return null;
  }

  private String parseString() {
    expect("'");
    var builder = new StringBuilder();
    while (!isAtEnd() && peek() != '\'') {
      var character = advance();
      if (character == '\\') {
        builder.append(parseEscape());
      } else {
        builder.append(character);
      }
    }
    if (isAtEnd()) {
      throw error("unterminated string");
    }
    expect("'");
    return builder.toString();
  }

  private char parseEscape() {
    if (isAtEnd()) {
      throw error("unterminated escape");
    }
    var escaped = advance();
    return switch (escaped) {
      case '\'', '\\' -> escaped;
      case 'n' -> '\n';
      case 'r' -> '\r';
      case 't' -> '\t';
      default -> throw error("unsupported escape");
    };
  }

  private BigDecimal parseNumber() {
    var start = position;
    if (peek() == '-') {
      advance();
    }
    consumeDigits();
    if (peek() == '.') {
      advance();
      consumeDigits();
    }
    try {
      return new BigDecimal(source.substring(start, position));
    } catch (NumberFormatException exception) {
      throw new RuleSyntaxException("invalid number", start);
    }
  }

  private void consumeDigits() {
    var start = position;
    while (isDigit(peek())) {
      advance();
    }
    if (start == position) {
      throw error("expected digit");
    }
  }

  private String parseIdentifier() {
    var start = position;
    advance();
    while (isIdentifierPart(peek())) {
      advance();
    }
    return source.substring(start, position);
  }

  private void expect(String token) {
    if (!match(token)) {
      throw error("expected " + token);
    }
  }

  private boolean match(String token) {
    skipWhitespace();
    if (!source.startsWith(token, position)) {
      return false;
    }
    position += token.length();
    return true;
  }

  private void skipWhitespace() {
    while (Character.isWhitespace(peek())) {
      advance();
    }
  }

  private char peek() {
    return isAtEnd() ? '\0' : source.charAt(position);
  }

  private char advance() {
    return source.charAt(position++);
  }

  private boolean isAtEnd() {
    return position >= source.length();
  }

  private RuleSyntaxException error(String message) {
    return new RuleSyntaxException(message, position);
  }

  private static boolean isDigit(char character) {
    return character >= '0' && character <= '9';
  }

  private static boolean isIdentifierStart(char character) {
    return (character >= 'A' && character <= 'Z')
        || (character >= 'a' && character <= 'z')
        || character == '_';
  }

  private static boolean isIdentifierPart(char character) {
    return isIdentifierStart(character) || isDigit(character);
  }
}
