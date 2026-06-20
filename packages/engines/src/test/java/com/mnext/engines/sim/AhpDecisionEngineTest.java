package com.mnext.engines.sim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AhpDecisionEngineTest {
  private static final double DELTA = 0.000_001d;

  @Test
  void calculatesManualAhpRankingWithConsistentEnoughMatrix() {
    var result =
        engine()
            .run(
                dataSet(
                    candidate("option-a", 100, 80, 70),
                    candidate("option-b", 120, 95, 60),
                    candidate("option-c", 90, 70, 85),
                    object("other", "note", Map.of("price", 1, "quality", 1, "delivery", 1))),
                config(
                    criteria("price", "cost"),
                    criteria("quality", "benefit"),
                    criteria("delivery", "benefit"),
                    matrix(row(1, 3, 4), row(1.0d / 3.0d, 1, 2), row(0.25d, 0.5d, 1))));

    assertEquals("decision-ahp", result.values().get("engineId"));
    assertEquals(true, result.values().get("consistent"));
    assertEquals(3.018294707289589d, number(result, "lambdaMax"), DELTA);
    assertEquals(0.015771299387576837d, number(result, "consistencyRatio"), DELTA);
    assertWeights(
        result,
        "price",
        0.6250130680906497d,
        "quality",
        0.23848712209274614d,
        "delivery",
        0.1364998098166041d);
    assertEquals("option-c", result.values().get("bestCandidateId"));
    assertRanking(
        result,
        new String[] {"option-c", "option-a", "option-b"},
        new double[] {0.3579582070571096d, 0.33458373378184725d, 0.307458059161043d});
  }

  @Test
  void consistentMatrixRestoresWeightsAndHasZeroConsistencyRatio() {
    var result =
        engine()
            .run(
                dataSet(candidate("option-a", 1, 2, 3), candidate("option-b", 2, 3, 4)),
                config(
                    criteria("price", "cost"),
                    criteria("quality", "benefit"),
                    criteria("delivery", "benefit"),
                    matrix(row(1, 2, 6), row(0.5d, 1, 3), row(1.0d / 6.0d, 1.0d / 3.0d, 1))));

    assertEquals(true, result.values().get("consistent"));
    assertEquals(0.0d, number(result, "consistencyRatio"), DELTA);
    assertEquals(3.0d, number(result, "lambdaMax"), DELTA);
    assertWeights(result, "price", 0.6d, "quality", 0.3d, "delivery", 0.1d);
  }

  @Test
  void inconsistentMatrixStillProducesRanking() {
    var result =
        engine()
            .run(
                dataSet(candidate("option-a", 100, 80, 70), candidate("option-b", 120, 95, 60)),
                config(
                    criteria("price", "cost"),
                    criteria("quality", "benefit"),
                    criteria("delivery", "benefit"),
                    matrix(row(1, 9, 1), row(1.0d / 9.0d, 1, 9), row(1, 1.0d / 9.0d, 1))));

    assertFalse((Boolean) result.values().get("consistent"));
    assertTrue(number(result, "consistencyRatio") > 0.10d);
    assertEquals(2, ((List<?>) result.values().get("ranking")).size());
  }

  @Test
  void registryFindsAhpEngine() {
    assertEquals("decision-ahp", new SimEngineRegistry().require("decision-ahp").engineId());
  }

  @Test
  void rejectsInvalidMatricesAndBounds() {
    assertSimulationError(
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(candidate("a", 1, 1, 1)),
                        config(List.of(criteria("price", "cost")), matrix(row(1))))),
        "criteria count");
    assertSimulationError(
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(candidate("a", 1, 1, 1)),
                        config(
                            criteria("price", "cost"),
                            criteria("quality", "benefit"),
                            matrix(row(1, 2))))),
        "square");
    assertSimulationError(
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(candidate("a", 1, 1, 1)),
                        config(
                            criteria("price", "cost"),
                            criteria("quality", "benefit"),
                            matrix(row(2, 2), row(0.5d, 1))))),
        "diagonal");
    assertSimulationError(
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(candidate("a", 1, 1, 1)),
                        config(
                            criteria("price", "cost"),
                            criteria("quality", "benefit"),
                            matrix(row(1, 2), row(0.25d, 1))))),
        "reciprocal");
    assertSimulationError(
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(candidate("a", 1, 1, 1)),
                        config(
                            criteria("price", "cost"),
                            criteria("quality", "benefit"),
                            matrix(row(1, 0), row(1, 1))))),
        "positive");
  }

  @Test
  void rejectsMissingFieldsNonPositiveCostTooManyCandidatesAndTooManyCriteria() {
    assertSimulationError(
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(object("a", "option", Map.of("price", 1))),
                        config(
                            criteria("price", "cost"),
                            criteria("quality", "benefit"),
                            matrix(row(1, 1), row(1, 1))))),
        "missing field");
    assertSimulationError(
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(object("a", "option", Map.of("price", 0, "quality", 1))),
                        config(
                            criteria("price", "cost"),
                            criteria("quality", "benefit"),
                            matrix(row(1, 1), row(1, 1))))),
        "cost criteria values");

    var candidates = new ArrayList<DataObject>();
    for (var index = 0; index <= AhpDecisionEngine.MAX_CANDIDATES; index++) {
      candidates.add(
          object("option-" + index, "option", Map.of("price", index + 1, "quality", index + 1)));
    }
    assertSimulationError(
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        new DataSet(candidates, List.of()),
                        config(
                            criteria("price", "cost"),
                            criteria("quality", "benefit"),
                            matrix(row(1, 1), row(1, 1))))),
        "candidate count exceeds");

    var criteria = new ArrayList<Map<String, Object>>();
    for (var index = 0; index <= AhpDecisionEngine.MAX_CRITERIA; index++) {
      criteria.add(criteria("field_" + index, "benefit"));
    }
    assertSimulationError(
        assertThrows(
            IllegalArgumentException.class,
            () -> engine().run(dataSet(candidate("a", 1, 1, 1)), config(criteria, List.of()))),
        "criteria count");
  }

  @Test
  void zeroBenefitColumnDoesNotCrashAndTiebreakUsesSourceOrder() {
    var result =
        engine()
            .run(
                dataSet(
                    object("option-a", "option", Map.of("zero", 0, "constant", 5)),
                    object("option-b", "option", Map.of("zero", 0, "constant", 5))),
                config(
                    criteria("zero", "benefit"),
                    criteria("constant", "benefit"),
                    matrix(row(1, 1), row(1, 1))));

    assertEquals("option-a", result.values().get("bestCandidateId"));
    assertRanking(result, new String[] {"option-a", "option-b"}, new double[] {0.25d, 0.25d});
  }

  private static AhpDecisionEngine engine() {
    return new AhpDecisionEngine();
  }

  private static SimConfig config(
      Map<String, Object> criterion1, Map<String, Object> criterion2, List<List<Double>> matrix) {
    return config(List.of(criterion1, criterion2), matrix);
  }

  private static SimConfig config(
      Map<String, Object> criterion1,
      Map<String, Object> criterion2,
      Map<String, Object> criterion3,
      List<List<Double>> matrix) {
    return config(List.of(criterion1, criterion2, criterion3), matrix);
  }

  private static SimConfig config(List<Map<String, Object>> criteria, List<List<Double>> matrix) {
    return new SimConfig(
        Map.of("candidateTypeCode", "option", "criteria", criteria, "comparisonMatrix", matrix));
  }

  private static Map<String, Object> criteria(String field, String direction) {
    var item = new LinkedHashMap<String, Object>();
    item.put("field", field);
    item.put("direction", direction);
    return Map.copyOf(item);
  }

  @SafeVarargs
  private static List<List<Double>> matrix(List<Double>... rows) {
    return List.of(rows);
  }

  private static List<Double> row(double... values) {
    return java.util.Arrays.stream(values).boxed().toList();
  }

  private static DataSet dataSet(DataObject... objects) {
    return new DataSet(List.of(objects), List.of());
  }

  private static DataObject candidate(
      String objectId, double price, double quality, double delivery) {
    return object(
        objectId, "option", Map.of("price", price, "quality", quality, "delivery", delivery));
  }

  private static DataObject object(
      String objectId, String objectTypeCode, Map<String, Object> fields) {
    return new DataObject(objectId, objectTypeCode, fields, "ACTIVE", 1);
  }

  private static double number(SimResult result, String key) {
    return ((Number) result.values().get(key)).doubleValue();
  }

  private static void assertWeights(
      SimResult result,
      String firstField,
      double firstWeight,
      String secondField,
      double secondWeight,
      String thirdField,
      double thirdWeight) {
    var weights = (List<?>) result.values().get("criteriaWeights");
    assertEquals(3, weights.size());
    assertWeight(weights.get(0), firstField, firstWeight);
    assertWeight(weights.get(1), secondField, secondWeight);
    assertWeight(weights.get(2), thirdField, thirdWeight);
  }

  private static void assertWeight(Object value, String field, double weight) {
    var item = (Map<?, ?>) value;
    assertEquals(field, item.get("field"));
    assertEquals(weight, ((Number) item.get("weight")).doubleValue(), DELTA);
  }

  private static void assertRanking(SimResult result, String[] candidateIds, double[] scores) {
    var ranking = (List<?>) result.values().get("ranking");
    assertEquals(candidateIds.length, ranking.size());
    for (var index = 0; index < candidateIds.length; index++) {
      var item = (Map<?, ?>) ranking.get(index);
      assertEquals(candidateIds[index], item.get("candidateId"));
      assertEquals(index + 1, item.get("rank"));
      assertEquals(scores[index], ((Number) item.get("score")).doubleValue(), DELTA);
    }
  }

  private static void assertSimulationError(IllegalArgumentException failure, String detail) {
    assertTrue(failure.getMessage().contains("SIM-422-"));
    assertTrue(failure.getMessage().contains(detail), failure.getMessage());
  }
}
