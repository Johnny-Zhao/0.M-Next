package com.mnext.engines.rules;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class DerivationEvaluatorTest {
  private final RuleEvaluator evaluator = new RuleEvaluator();

  @Test
  void traversesSingleHopAndAggregatesCountAndSum() {
    var link = node("bandwidth", 25);
    link.connect("carries", node("load", 10)).connect("carries", node("load", 12));

    assertDecimal("22", value("sum(traverse('carries','out'),'load')", link));
    assertEquals(2, value("count(traverse('carries','out'))", link));
    assertTrue(bool("sum(traverse('carries','out'),'load') < field('bandwidth')", link));
  }

  @Test
  void traversesFromAnExistingSetForChainedPaths() {
    var link = node();
    var message = node("load", 3);
    message.connect("emits", node("bits", 8)).connect("emits", node("bits", 13));
    link.connect("carries", message);

    assertDecimal(
        "21", value("sum(traverseFrom(traverse('carries','out'),'emits','out'),'bits')", link));
  }

  @Test
  void traversesDeepForTransitiveClosureAggregates() {
    var system = node("mass", 100);
    var child = node("mass", 10);
    var leaf = node("mass", 4);
    child.connect("contains", leaf);
    system.connect("contains", child).connect("contains", node("mass", 6));

    assertDecimal("20", value("sum(traverseDeep('contains','out',3),'mass')", system));
    assertEquals(3, value("count(traverseDeep('contains','out',3))", system));
  }

  @Test
  void evaluatesEveryAggregateOperator() {
    var root = node();
    root.connect("children", node("score", 8, "ready", true))
        .connect("children", node("score", 4, "ready", true))
        .connect("children", node("score", 6, "ready", false));

    assertDecimal("6", value("avg(traverse('children','out'),'score')", root));
    assertDecimal("8", value("max(traverse('children','out'),'score')", root));
    assertDecimal("4", value("min(traverse('children','out'),'score')", root));
    assertTrue(bool("any(traverse('children','out'), field('ready') == false)", root));
    assertTrue(bool("all(traverse('children','out'), field('score') >= 4)", root));
  }

  @Test
  void evaluatesOclCollectionSubsetEquivalentToMExprAggregates() {
    var root = node();
    root.connect("children", node("score", 8, "ready", true, "name", "a"))
        .connect("children", node("score", 4, "ready", true, "name", "b"))
        .connect("children", node("score", 6, "ready", false, "name", "c"));

    assertEquals(
        value("count(traverse('children','out'))", root), value("self.children->size()", root));
    assertEquals(
        value("sum(traverse('children','out'),'score')", root),
        value("self.children->collect(c | c.score)->sum()", root));
    assertTrue(bool("self.children->select(c | c.score >= 6)->size() = 2", root));
    assertTrue(bool("self.children->reject(c | c.ready)->size() = 1", root));
    assertTrue(bool("self.children->exists(c | c.ready = false)", root));
    assertTrue(bool("self.children->forAll(c | c.score >= 4)", root));
    assertTrue(bool("self.children->collect(c | c.name)->includes('b')", root));
  }

  @Test
  void evaluatesArithmeticConditionalsAndNestedAggregates() {
    var link = node("bandwidth", 20);
    link.connect("carries", node("load", 9)).connect("carries", node("load", 15));

    assertDecimal(
        "4",
        value(
            "if(sum(traverse('carries','out'),'load') > field('bandwidth'), sum(traverse('carries','out'),'load') - field('bandwidth'), 0)",
            link));
    assertDecimal("13", value("1 + 2 * 6", link));
    assertDecimal("9", value("(1 + 2) * 3", link));
  }

  @Test
  void enforcesTraversalDepthWidthAndStepLimits() {
    var root = node();
    root.connect("children", node()).connect("children", node()).connect("children", node());

    assertThrows(
        RuleEvalLimitException.class,
        () -> value("count(traverseDeep('children','out',33))", root));
    assertThrows(
        RuleEvalLimitException.class,
        () ->
            new RuleEvaluator(64, 512, 16, 32, 2)
                .evaluateValue(RuleParser.parse("count(traverse('children','out'))"), root));
    assertThrows(
        RuleEvalLimitException.class,
        () ->
            new RuleEvaluator(64, 4)
                .evaluate(
                    RuleParser.parse(
                        "all(traverse('children','out'), field('missing') == null && true)"),
                    root));
  }

  @Test
  void isDeterministicForSameGraphAndExpression() {
    var root = node();
    root.connect("children", node("score", 1)).connect("children", node("score", 2));
    var expression = RuleParser.parse("sum(traverse('children','out'),'score') * 2");

    assertEquals(
        evaluator.evaluateValue(expression, root), evaluator.evaluateValue(expression, root));
  }

  @Test
  void remainsBackwardCompatibleWithRuleExpressions() {
    var context = node("status", "OPEN", "score", "81", "empty", "");

    assertTrue(bool("field('status') == 'OPEN' && toNumber(field('score')) >= 80", context));
    assertTrue(bool("isBlank(field('empty')) || relationCount('parent') == 0", context));
  }

  private Object value(String source, EvalContext context) {
    return evaluator.evaluateValue(RuleParser.parse(source), context);
  }

  private boolean bool(String source, EvalContext context) {
    return evaluator.evaluate(RuleParser.parse(source), context);
  }

  private void assertDecimal(String expected, Object actual) {
    assertTrue(actual instanceof BigDecimal, "expected BigDecimal but got " + actual);
    assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) actual));
  }

  private MemoryContext node(Object... entries) {
    return new MemoryContext(Map.ofEntries(entries(entries)));
  }

  @SuppressWarnings("unchecked")
  private Map.Entry<String, Object>[] entries(Object... values) {
    var entries = new Map.Entry[values.length / 2];
    for (var index = 0; index < values.length; index += 2) {
      entries[index / 2] = Map.entry((String) values[index], values[index + 1]);
    }
    return entries;
  }

  private static final class MemoryContext implements EvalContext {
    private final Map<String, Object> fields;
    private final Map<String, List<MemoryContext>> out = new HashMap<>();
    private final Map<String, List<MemoryContext>> in = new HashMap<>();

    private MemoryContext(Map<String, Object> fields) {
      this.fields = fields;
    }

    private MemoryContext connect(String relType, MemoryContext target) {
      out.computeIfAbsent(relType, ignored -> new ArrayList<>()).add(target);
      target.in.computeIfAbsent(relType, ignored -> new ArrayList<>()).add(this);
      return this;
    }

    @Override
    public Object fieldValue(String code) {
      return fields.get(code);
    }

    @Override
    public int relationCount(String type) {
      return out.getOrDefault(type, List.of()).size();
    }

    @Override
    public boolean hasRelation(String type) {
      return relationCount(type) > 0;
    }

    @Override
    public Iterable<EvalContext> traverse(String relType, String dir) {
      var values = "out".equals(dir) ? out : in;
      return List.copyOf(values.getOrDefault(relType, List.of()));
    }
  }
}
