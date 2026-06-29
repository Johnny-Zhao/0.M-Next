package com.mnext.engines.rules;

import java.math.BigDecimal;
import java.util.Set;

public final class OclParser {
  private static final Set<String> ITERATORS =
      Set.of("select", "reject", "collect", "forAll", "exists");
  private final String source;
  private int position;

  private OclParser(String source) {
    this.source = source;
  }

  public static RuleExpression parse(String source) {
    if (source == null || source.isBlank()) {
      throw new RuleSyntaxException("expression must not be blank", 0);
    }
    if (source.length() > RuleParser.MAX_SOURCE_LENGTH) {
      throw new RuleSyntaxException("expression is too long", RuleParser.MAX_SOURCE_LENGTH);
    }
    var parser = new OclParser(source);
    var expression = parser.parseOr();
    parser.skipWhitespace();
    if (!parser.isAtEnd()) {
      throw parser.error("unexpected token");
    }
    return expression;
  }

  private RuleExpression parseOr() {
    var expression = parseAnd();
    while (true) {
      if (matchKeyword("or") || match("||")) {
        expression = new Logical(expression, Logical.Operator.OR, parseAnd());
      } else {
        return expression;
      }
    }
  }

  private RuleExpression parseAnd() {
    var expression = parseUnary();
    while (true) {
      if (matchKeyword("and") || match("&&")) {
        expression = new Logical(expression, Logical.Operator.AND, parseUnary());
      } else {
        return expression;
      }
    }
  }

  private RuleExpression parseUnary() {
    if (matchKeyword("not") || match("!")) {
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
    var expression = parsePostfix();
    while (true) {
      if (match("*")) {
        expression = new Arithmetic(expression, Arithmetic.Operator.MULTIPLY, parsePostfix());
      } else if (match("/")) {
        expression = new Arithmetic(expression, Arithmetic.Operator.DIVIDE, parsePostfix());
      } else {
        return expression;
      }
    }
  }

  private RuleExpression parsePostfix() {
    var expression = parsePrimary();
    while (true) {
      if (match(".")) {
        var property = parseIdentifier();
        if ("oclIsUndefined".equals(property)) {
          expect("(");
          expect(")");
          expression = new FunctionCall("isBlank", java.util.List.of(expression));
        } else {
          expression = new FieldRef(property);
        }
      } else if (match("->")) {
        expression = parseArrow(expression);
      } else {
        return selfToContext(expression);
      }
    }
  }

  private RuleExpression parseArrow(RuleExpression sourceExpression) {
    var method = parseIdentifier();
    var source = collectionSource(sourceExpression);
    expect("(");
    RuleExpression result =
        ITERATORS.contains(method)
            ? parseIterator(source, method)
            : parseCollectionOperation(source, method);
    expect(")");
    return result;
  }

  private RuleExpression parseIterator(RuleExpression source, String method) {
    skipWhitespace();
    String variable = null;
    if (isIdentifierStart(peek())) {
      var checkpoint = position;
      var candidate = parseIdentifier();
      skipWhitespace();
      if (match("|")) {
        variable = candidate;
      } else {
        position = checkpoint;
      }
    }
    return new OclIteration(source, iteratorOperator(method), variable, parseOr());
  }

  private RuleExpression parseCollectionOperation(RuleExpression source, String method) {
    return switch (method) {
      case "isEmpty" -> new OclIteration(source, OclIteration.Operator.IS_EMPTY, null, null);
      case "size" -> new OclIteration(source, OclIteration.Operator.SIZE, null, null);
      case "sum" -> new OclIteration(source, OclIteration.Operator.SUM, null, null);
      case "includes" -> new OclIteration(source, OclIteration.Operator.INCLUDES, null, parseOr());
      default -> throw error("unsupported collection operation " + method);
    };
  }

  private OclIteration.Operator iteratorOperator(String method) {
    return switch (method) {
      case "select" -> OclIteration.Operator.SELECT;
      case "reject" -> OclIteration.Operator.REJECT;
      case "collect" -> OclIteration.Operator.COLLECT;
      case "forAll" -> OclIteration.Operator.FOR_ALL;
      case "exists" -> OclIteration.Operator.EXISTS;
      default -> throw error("unsupported iterator " + method);
    };
  }

  private RuleExpression collectionSource(RuleExpression expression) {
    if (expression instanceof FieldRef fieldRef) {
      return new Traverse(fieldRef.code(), "out");
    }
    return selfToContext(expression);
  }

  private RuleExpression selfToContext(RuleExpression expression) {
    if (expression instanceof SelfRef) {
      throw error("self must be followed by a property");
    }
    return expression;
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
      if ("self".equals(identifier)) {
        return new SelfRef();
      }
      if ("true".equals(identifier)) {
        return new Literal(true);
      }
      if ("false".equals(identifier)) {
        return new Literal(false);
      }
      if ("null".equals(identifier)) {
        return new Literal(null);
      }
      if (match("(")) {
        var expression = parseFunction(identifier);
        expect(")");
        return expression;
      }
      return new FieldRef(identifier);
    }
    throw error("expected expression");
  }

  private RuleExpression parseFunction(String name) {
    if ("if".equals(name)) {
      var condition = parseOr();
      expect(",");
      var ifTrue = parseOr();
      expect(",");
      return new Conditional(condition, ifTrue, parseOr());
    }
    throw error("unsupported function " + name);
  }

  private Comparison.Operator comparisonOperator() {
    if (match("==") || match("=")) {
      return Comparison.Operator.EQ;
    }
    if (match("<>") || match("!=")) {
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
      builder.append(character == '\\' ? parseEscape() : character);
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
    skipWhitespace();
    if (!isIdentifierStart(peek())) {
      throw error("expected identifier");
    }
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

  private boolean matchKeyword(String keyword) {
    skipWhitespace();
    if (!source.startsWith(keyword, position)) {
      return false;
    }
    var end = position + keyword.length();
    if (end < source.length() && isIdentifierPart(source.charAt(end))) {
      return false;
    }
    position = end;
    return true;
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
