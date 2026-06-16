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
    var expression = parsePrimary();
    var operator = comparisonOperator();
    if (operator == null) {
      return expression;
    }
    return new Comparison(expression, operator, parsePrimary());
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
    if (!RuleFunctions.isAllowed(name) && !"field".equals(name)) {
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
