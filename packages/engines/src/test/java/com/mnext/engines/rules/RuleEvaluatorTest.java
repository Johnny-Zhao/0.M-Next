package com.mnext.engines.rules;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;

class RuleEvaluatorTest {
  private final RuleEvaluator evaluator = new RuleEvaluator();

  @Test
  void parsesAndEvaluatesTrueAndFalseExpressions() {
    var context = context(Map.of("status", "OPEN", "score", "81"), Map.of("parent", 1));

    assertTrue(evaluate("field('status') == 'OPEN' && toNumber(field('score')) >= 80", context));
    assertFalse(evaluate("field('status') == 'CLOSED' || toNumber(field('score')) < 60", context));
  }

  @Test
  void supportsComparisonAndLogicalOperators() {
    var context = context(Map.of("a", "10", "b", "abc"), Map.of());

    assertTrue(evaluate("field('a') == 10 && field('a') != 11", context));
    assertTrue(evaluate("field('a') > 9 && field('a') >= 10", context));
    assertTrue(evaluate("field('a') < 11 && field('a') <= 10", context));
    assertTrue(evaluate("!(field('b') == 'def') && ('abc' <= field('b'))", context));
  }

  @Test
  void treatsMissingFieldsAsNull() {
    var context = context(Map.of(), Map.of());

    assertTrue(evaluate("field('missing') == null", context));
    assertTrue(evaluate("isBlank(field('missing'))", context));
    assertFalse(evaluate("field('missing') != null", context));
  }

  @Test
  void evaluatesScalarFunctions() {
    var context = context(Map.of("name", "alpha", "empty", ""), Map.of());

    assertTrue(evaluate("length(field('name')) == 5", context));
    assertTrue(evaluate("matches(field('name'), 'a[a-z]+')", context));
    assertTrue(evaluate("inSet(field('name'), 'beta', 'alpha')", context));
    assertTrue(evaluate("coalesce(field('missing'), field('name')) == 'alpha'", context));
    assertTrue(evaluate("toNumber('42.5') > 40", context));
    assertTrue(evaluate("isBlank(field('empty'))", context));
  }

  @Test
  void evaluatesBoundedRelationFunctionsThroughContext() {
    var context = context(Map.of(), Map.of("parent", 2, "blocks", 0));

    assertTrue(evaluate("relationCount('parent') == 2", context));
    assertTrue(evaluate("hasRelation('parent')", context));
    assertFalse(evaluate("hasRelation('blocks')", context));

    var limited = new RuleEvaluator(100, 100, 1);
    var expression = RuleParser.parse("hasRelation('parent') && hasRelation('blocks')");
    assertThrows(RuleEvalLimitException.class, () -> limited.evaluate(expression, context));
  }

  @Test
  void rejectsSyntaxErrorsAndUnknownFunctions() {
    assertThrows(RuleSyntaxException.class, () -> RuleParser.parse("field('name' == 'x'"));
    assertThrows(RuleSyntaxException.class, () -> RuleParser.parse("eval('1 + 1')"));
    assertThrows(RuleSyntaxException.class, () -> RuleParser.parse("field('') == null"));
  }

  @Test
  void enforcesDepthLimit() {
    var expression = RuleParser.parse("!!!!!!!!!!!!!!!!!!!!true");
    var limited = new RuleEvaluator(8, 100);

    assertThrows(
        RuleEvalLimitException.class,
        () -> limited.evaluate(expression, context(Map.of(), Map.of())));
  }

  @Test
  void enforcesStepLimit() {
    var source = String.join(" || ", java.util.Collections.nCopies(40, "false"));
    var expression = RuleParser.parse(source);
    var limited = new RuleEvaluator(100, 20);

    assertThrows(
        RuleEvalLimitException.class,
        () -> limited.evaluate(expression, context(Map.of(), Map.of())));
  }

  @Test
  void regexRedosShapeIsBlockedByLengthLimit() {
    var longInput = "a".repeat(RuleFunctions.MAX_REGEX_INPUT_LENGTH + 1);
    var context = context(Map.of("text", longInput), Map.of());
    var expression = RuleParser.parse("matches(field('text'), '(a+)+b')");

    assertThrows(RuleEvalLimitException.class, () -> evaluator.evaluate(expression, context));
  }

  @Test
  void parserProducesAstNodes() {
    var expression = RuleParser.parse("field('name') == 'alpha'");

    assertInstanceOf(Comparison.class, expression);
    assertDoesNotThrow(
        () -> evaluator.evaluate(expression, context(Map.of("name", "alpha"), Map.of())));
  }

  private boolean evaluate(String source, EvalContext context) {
    return evaluator.evaluate(RuleParser.parse(source), context);
  }

  private EvalContext context(Map<String, Object> fields, Map<String, Integer> relations) {
    return new EvalContext() {
      @Override
      public Object fieldValue(String code) {
        return fields.get(code);
      }

      @Override
      public int relationCount(String type) {
        return relations.getOrDefault(type, 0);
      }

      @Override
      public boolean hasRelation(String type) {
        return relationCount(type) > 0;
      }
    };
  }
}
