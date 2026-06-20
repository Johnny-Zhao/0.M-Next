package com.mnext.engines.sim;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class WpmDecisionEngine implements SimulationEngine {
  static final int MAX_CANDIDATES = 1000;
  static final int MAX_CRITERIA = 64;
  private static final String ENGINE_ID = "decision-wpm";

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
    var values = decisionMatrix(candidates, criteria);
    var normalized = normalized(values, criteria);
    var ranking = ranking(scores(candidates, criteria, normalized));

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

  private static double[][] decisionMatrix(List<DataObject> candidates, List<Criterion> criteria) {
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

  private static double[][] normalized(double[][] values, List<Criterion> criteria) {
    var normalized = new double[values.length][criteria.size()];
    for (var column = 0; column < criteria.size(); column++) {
      if (criteria.get(column).direction() == Direction.BENEFIT) {
        normalizeBenefit(values, normalized, column);
      } else {
        normalizeCost(values, normalized, column);
      }
    }
    return normalized;
  }

  private static void normalizeBenefit(double[][] values, double[][] normalized, int column) {
    var sum = 0.0d;
    for (double[] value : values) {
      sum += value[column];
    }
    if (sum == 0.0d) return;
    for (var row = 0; row < values.length; row++) {
      normalized[row][column] = values[row][column] / sum;
    }
  }

  private static void normalizeCost(double[][] values, double[][] normalized, int column) {
    var inverseSum = 0.0d;
    for (double[] value : values) {
      if (value[column] <= 0.0d) {
        throw simError("cost criteria values must be positive");
      }
      inverseSum += 1.0d / value[column];
    }
    for (var row = 0; row < values.length; row++) {
      normalized[row][column] = (1.0d / values[row][column]) / inverseSum;
    }
  }

  private static List<Score> scores(
      List<DataObject> candidates, List<Criterion> criteria, double[][] normalized) {
    var scores = new ArrayList<Score>();
    for (var row = 0; row < candidates.size(); row++) {
      var score = 1.0d;
      for (var column = 0; column < criteria.size(); column++) {
        score *= Math.pow(normalized[row][column], criteria.get(column).weight());
      }
      scores.add(new Score(candidates.get(row).objectId(), score, row));
    }
    return List.copyOf(scores);
  }

  private static List<Map<String, Object>> ranking(List<Score> scores) {
    var sorted = new ArrayList<>(scores);
    sorted.sort(
        Comparator.comparingDouble(Score::score).reversed().thenComparingInt(Score::sourceIndex));
    var ranking = new ArrayList<Map<String, Object>>();
    for (var index = 0; index < sorted.size(); index++) {
      var item = new LinkedHashMap<String, Object>();
      item.put("candidateId", sorted.get(index).candidateId());
      item.put("score", sorted.get(index).score());
      item.put("rank", index + 1);
      ranking.add(Map.copyOf(item));
    }
    return List.copyOf(ranking);
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

  private record Score(String candidateId, double score, int sourceIndex) {}
}
