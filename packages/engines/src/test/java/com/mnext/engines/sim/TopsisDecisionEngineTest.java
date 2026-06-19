package com.mnext.engines.sim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TopsisDecisionEngineTest {
  private static final double DELTA = 0.000_000_001d;

  @Test
  void calculatesManualTopsisRanking() {
    var result =
        engine()
            .run(
                dataSet(
                    candidate("option-a", 100, 80),
                    candidate("option-b", 120, 90),
                    candidate("option-c", 90, 70),
                    object("other", "note", Map.of("price", 1, "quality", 1))),
                config(criteria("price", 0.5d, "cost"), criteria("quality", 0.5d, "benefit")));

    assertEquals("decision-topsis", result.values().get("engineId"));
    assertEquals("option-a", result.values().get("bestCandidateId"));
    assertRanking(
        result,
        new String[] {"option-a", "option-c", "option-b"},
        new double[] {0.5929164689226447d, 0.5368037140386405d, 0.46319628596135953d});
  }

  @Test
  void registryFindsTopsisEngine() {
    assertEquals("decision-topsis", new SimEngineRegistry().require("decision-topsis").engineId());
  }

  @Test
  void missingCandidatesReportSimulationError() {
    var failure =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(object("note-1", "note", Map.of("price", 1))),
                        config(criteria("price", 1.0d, "cost"))));

    assertSimulationError(failure, "missing candidates");
  }

  @Test
  void missingFieldReportsSimulationError() {
    var failure =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(object("option-a", "option", Map.of("price", 100))),
                        config(criteria("quality", 1.0d, "benefit"))));

    assertSimulationError(failure, "missing field");
  }

  @Test
  void tooManyCandidatesReportSimulationError() {
    var candidates = new ArrayList<DataObject>();
    for (var index = 0; index <= TopsisDecisionEngine.MAX_CANDIDATES; index++) {
      candidates.add(object("option-" + index, "option", Map.of("price", index + 1)));
    }

    var failure =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        new DataSet(candidates, List.of()),
                        config(criteria("price", 1.0d, "cost"))));

    assertSimulationError(failure, "candidate count exceeds");
  }

  @Test
  void tooManyCriteriaReportSimulationError() {
    var criteria = new ArrayList<Map<String, Object>>();
    for (var index = 0; index <= TopsisDecisionEngine.MAX_CRITERIA; index++) {
      criteria.add(criteria("field_" + index, 1.0d, "benefit"));
    }

    var failure =
        assertThrows(
            IllegalArgumentException.class,
            () -> engine().run(dataSet(candidate("option-a", 100, 80)), config(criteria)));

    assertSimulationError(failure, "criteria count exceeds");
  }

  @Test
  void negativeWeightReportsSimulationError() {
    var failure =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(candidate("option-a", 100, 80)),
                        config(criteria("price", -0.1d, "cost"))));

    assertSimulationError(failure, "non-negative");
  }

  @Test
  void equalAndZeroColumnsDoNotCrash() {
    var result =
        engine()
            .run(
                dataSet(
                    object("option-a", "option", Map.of("zero", 0, "constant", 5)),
                    object("option-b", "option", Map.of("zero", 0, "constant", 5))),
                config(criteria("zero", 0.5d, "benefit"), criteria("constant", 0.5d, "cost")));

    assertEquals("option-a", result.values().get("bestCandidateId"));
    assertRanking(result, new String[] {"option-a", "option-b"}, new double[] {0.0d, 0.0d});
  }

  private static TopsisDecisionEngine engine() {
    return new TopsisDecisionEngine();
  }

  @SafeVarargs
  private static SimConfig config(Map<String, Object>... criteria) {
    return config(List.of(criteria));
  }

  private static SimConfig config(List<Map<String, Object>> criteria) {
    return new SimConfig(Map.of("candidateTypeCode", "option", "criteria", criteria));
  }

  private static Map<String, Object> criteria(String field, double weight, String direction) {
    var item = new LinkedHashMap<String, Object>();
    item.put("field", field);
    item.put("weight", weight);
    item.put("direction", direction);
    return Map.copyOf(item);
  }

  private static DataSet dataSet(DataObject... objects) {
    return new DataSet(List.of(objects), List.of());
  }

  private static DataObject candidate(String objectId, double price, double quality) {
    return object(objectId, "option", Map.of("price", price, "quality", quality));
  }

  private static DataObject object(
      String objectId, String objectTypeCode, Map<String, Object> fields) {
    return new DataObject(objectId, objectTypeCode, fields, "ACTIVE", 1);
  }

  private static void assertRanking(SimResult result, String[] candidateIds, double[] closeness) {
    var ranking = (List<?>) result.values().get("ranking");
    assertEquals(candidateIds.length, ranking.size());
    for (var index = 0; index < candidateIds.length; index++) {
      var item = (Map<?, ?>) ranking.get(index);
      assertEquals(candidateIds[index], item.get("candidateId"));
      assertEquals(index + 1, item.get("rank"));
      assertEquals(closeness[index], ((Number) item.get("closeness")).doubleValue(), DELTA);
    }
  }

  private static void assertSimulationError(IllegalArgumentException failure, String detail) {
    assertTrue(failure.getMessage().contains("SIM-422-"));
    assertTrue(failure.getMessage().contains(detail));
  }
}
