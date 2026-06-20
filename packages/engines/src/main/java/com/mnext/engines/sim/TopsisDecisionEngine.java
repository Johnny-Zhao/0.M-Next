package com.mnext.engines.sim;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class TopsisDecisionEngine implements SimulationEngine {
  static final int MAX_CANDIDATES = 1000;
  static final int MAX_CRITERIA = 64;
  private static final String ENGINE_ID = "decision-topsis";

  @Override
  public String engineId() {
    return ENGINE_ID;
  }

  @Override
  public SimResult run(DataSet snapshot, SimConfig config) {
    var parameters = config == null ? Map.<String, Object>of() : config.parameters();
    var candidateTypeCode = requiredText(parameters, "candidateTypeCode", "config");
    var criteria = criteria(parameters.get("criteria"));
    var candidates = candidates(snapshot, candidateTypeCode);
    var matrix = matrix(candidates, criteria);
    var weighted = weighted(normalized(matrix), criteria);
    var ideals = ideals(weighted, criteria);
    var ranking = ranking(candidates, weighted, ideals);

    return new SimResult(resultValues(ranking));
  }

  private static List<Criterion> criteria(Object value) {
    if (!(value instanceof List<?> values) || values.isEmpty()) {
      throw simError("config.criteria must not be empty");
    }
    if (values.size() > MAX_CRITERIA) {
      throw simError("criteria count exceeds " + MAX_CRITERIA);
    }

    var criteria = new ArrayList<Criterion>();
    for (var index = 0; index < values.size(); index++) {
      if (!(values.get(index) instanceof Map<?, ?> item)) {
        throw simError("config.criteria[" + index + "] must be an object");
      }
      var label = "config.criteria[" + index + "]";
      criteria.add(
          new Criterion(
              requiredText(item, "field", label),
              nonNegativeNumber(item.get("weight"), label + ".weight"),
              direction(item.get("direction"), label + ".direction")));
    }
    return List.copyOf(criteria);
  }

  private static List<DataObject> candidates(DataSet snapshot, String candidateTypeCode) {
    if (snapshot == null) {
      throw simError("missing snapshot");
    }
    var candidates =
        snapshot.objects().stream()
            .filter(object -> candidateTypeCode.equals(object.objectTypeCode()))
            .toList();
    if (candidates.isEmpty()) {
      throw simError("missing candidates for type " + candidateTypeCode);
    }
    if (candidates.size() > MAX_CANDIDATES) {
      throw simError("candidate count exceeds " + MAX_CANDIDATES);
    }
    return candidates;
  }

  private static double[][] matrix(List<DataObject> candidates, List<Criterion> criteria) {
    var matrix = new double[candidates.size()][criteria.size()];
    for (var row = 0; row < candidates.size(); row++) {
      var candidate = candidates.get(row);
      requireCandidateId(candidate);
      for (var column = 0; column < criteria.size(); column++) {
        var field = criteria.get(column).field();
        if (!candidate.fields().containsKey(field)) {
          throw simError("missing field " + candidate.objectId() + "." + field);
        }
        matrix[row][column] =
            number(candidate.fields().get(field), candidate.objectId() + "." + field);
      }
    }
    return matrix;
  }

  private static double[][] normalized(double[][] matrix) {
    var result = new double[matrix.length][matrix[0].length];
    for (var column = 0; column < matrix[0].length; column++) {
      var squaredSum = 0.0d;
      for (double[] doubles : matrix) {
        squaredSum += doubles[column] * doubles[column];
      }
      var denominator = Math.sqrt(squaredSum);
      if (denominator == 0.0d) {
        continue;
      }
      for (var row = 0; row < matrix.length; row++) {
        result[row][column] = matrix[row][column] / denominator;
      }
    }
    return result;
  }

  private static double[][] weighted(double[][] normalized, List<Criterion> criteria) {
    var result = new double[normalized.length][normalized[0].length];
    for (var row = 0; row < normalized.length; row++) {
      for (var column = 0; column < normalized[row].length; column++) {
        result[row][column] = normalized[row][column] * criteria.get(column).weight();
      }
    }
    return result;
  }

  private static Ideals ideals(double[][] weighted, List<Criterion> criteria) {
    var positive = new double[weighted[0].length];
    var negative = new double[weighted[0].length];
    for (var column = 0; column < weighted[0].length; column++) {
      var min = weighted[0][column];
      var max = weighted[0][column];
      for (var row = 1; row < weighted.length; row++) {
        min = Math.min(min, weighted[row][column]);
        max = Math.max(max, weighted[row][column]);
      }
      if (criteria.get(column).direction() == Direction.BENEFIT) {
        positive[column] = max;
        negative[column] = min;
      } else {
        positive[column] = min;
        negative[column] = max;
      }
    }
    return new Ideals(positive, negative);
  }

  private static List<Map<String, Object>> ranking(
      List<DataObject> candidates, double[][] weighted, Ideals ideals) {
    var scores = new ArrayList<Score>();
    for (var row = 0; row < weighted.length; row++) {
      var positiveDistance = distance(weighted[row], ideals.positive());
      var negativeDistance = distance(weighted[row], ideals.negative());
      var denominator = positiveDistance + negativeDistance;
      var closeness = denominator == 0.0d ? 0.0d : negativeDistance / denominator;
      scores.add(new Score(candidates.get(row).objectId(), closeness, row));
    }

    scores.sort(
        Comparator.comparingDouble(Score::closeness)
            .reversed()
            .thenComparingInt(Score::sourceIndex));
    var ranking = new ArrayList<Map<String, Object>>();
    for (var index = 0; index < scores.size(); index++) {
      var item = new LinkedHashMap<String, Object>();
      item.put("candidateId", scores.get(index).candidateId());
      item.put("closeness", scores.get(index).closeness());
      item.put("rank", index + 1);
      ranking.add(Map.copyOf(item));
    }
    return List.copyOf(ranking);
  }

  private static double distance(double[] values, double[] target) {
    var squaredSum = 0.0d;
    for (var index = 0; index < values.length; index++) {
      var delta = values[index] - target[index];
      squaredSum += delta * delta;
    }
    return Math.sqrt(squaredSum);
  }

  private Map<String, Object> resultValues(List<Map<String, Object>> ranking) {
    var values = new LinkedHashMap<String, Object>();
    values.put("engineId", engineId());
    values.put("ranking", ranking);
    values.put("bestCandidateId", ranking.getFirst().get("candidateId"));
    return Map.copyOf(values);
  }

  private static Direction direction(Object value, String label) {
    if (!(value instanceof String text) || text.isBlank()) {
      throw simError(label + " must be benefit or cost");
    }
    return switch (text) {
      case "benefit" -> Direction.BENEFIT;
      case "cost" -> Direction.COST;
      default -> throw simError(label + " must be benefit or cost");
    };
  }

  private static String requiredText(Map<?, ?> values, String key, String label) {
    var value = values.get(key);
    if (!(value instanceof String text) || text.isBlank()) {
      throw simError(label + "." + key + " must not be empty");
    }
    return text;
  }

  private static void requireCandidateId(DataObject candidate) {
    if (candidate.objectId() == null || candidate.objectId().isBlank()) {
      throw simError("candidate id must not be empty");
    }
  }

  private static double nonNegativeNumber(Object value, String label) {
    var number = number(value, label);
    if (number < 0.0d) {
      throw simError(label + " must be non-negative");
    }
    return number;
  }

  private static double number(Object value, String label) {
    var number = numericValue(value, label);
    if (!Double.isFinite(number)) {
      throw simError(label + " must be finite");
    }
    return number;
  }

  private static double numericValue(Object value, String label) {
    if (value instanceof Number number) {
      return number.doubleValue();
    }
    if (value instanceof String text) {
      return parseNumber(text, label);
    }
    throw simError(label + " must be numeric");
  }

  private static double parseNumber(String value, String label) {
    try {
      return Double.parseDouble(value);
    } catch (NumberFormatException ex) {
      throw simError(label + " must be numeric");
    }
  }

  private static IllegalArgumentException simError(String message) {
    return new IllegalArgumentException("SIM-422-" + message);
  }

  private enum Direction {
    BENEFIT,
    COST
  }

  private record Criterion(String field, double weight, Direction direction) {}

  private record Ideals(double[] positive, double[] negative) {}

  private record Score(String candidateId, double closeness, int sourceIndex) {}
}
