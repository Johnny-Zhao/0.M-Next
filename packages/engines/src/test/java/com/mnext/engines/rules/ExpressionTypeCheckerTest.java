package com.mnext.engines.rules;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class ExpressionTypeCheckerTest {
  private final ExpressionTypeChecker checker =
      new ExpressionTypeChecker(
          new ExpressionTypeChecker.Model()
              .field("system", "name", "string")
              .field("system", "capacity", "number")
              .field("module", "score", "number")
              .field("module", "ready", "boolean")
              .relation("system", "modules", "module"));

  @Test
  void acceptsBoundedOclCollectionPredicates() {
    assertDoesNotThrow(
        () ->
            checker.requireBoolean(
                OclParser.parse("self.modules->forAll(m | m.score >= 0 and m.ready = true)"),
                "system"));
  }

  @Test
  void rejectsTypeMismatchesBeforeEvaluation() {
    assertThrows(
        RuleSyntaxException.class,
        () ->
            checker.requireBoolean(
                OclParser.parse("self.modules->exists(m | m.score and m.ready)"), "system"));
    assertThrows(
        RuleSyntaxException.class,
        () -> checker.check(OclParser.parse("self.missing->size()"), "system"));
    assertThrows(
        RuleSyntaxException.class, () -> checker.check(OclParser.parse("self.name + 1"), "system"));
  }
}
