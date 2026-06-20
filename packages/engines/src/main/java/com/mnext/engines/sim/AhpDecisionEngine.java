package com.mnext.engines.sim;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class AhpDecisionEngine implements SimulationEngine {
  static final int MAX_CANDIDATES = 1000;
  static final int MAX_CRITERIA = 10;
  private static final String ENGINE_ID = "decision-ahp";
  private static final double MATRIX_TOLERANCE = 0.000_001d;
  private static final double DEFAULT_CONSISTENCY_THRESHOLD = 0.10d;
  private static final double[] RANDOM_INDEX = {
    0.0d, 0.0d, 0.0d, 0.58d, 0.90d, 1.12d, 1.24d, 1.32d, 1.41d, 1.45d, 1.49d
  };

  @Override
  public String engineId() {
    return ENGINE_ID;
  }

  @Override
  public SimResult run(DataSet snapshot, SimConfig config) {
    var parameters = config == null ? Map.<String, Object>of() : config.parameters();
    var candidateTypeCode = requiredText(parameters, "candidateTypeCode", "config");
    var criteria = criteria(parameters.get("criteria"));
    var matrix = comparisonMatrix(parameters.get("comparisonMatrix"), criteria.size());
    var threshold = consistencyThreshold(parameters.get("consistencyThreshold"));
    var weights = weights(matrix);
    var consistency = consistency(matrix, weights, threshold);
    var candidates = candidates(snapshot, candidateTypeCode);
    var scores = scores(candidates, criteria, weights);
    var ranking = ranking(scores);

    return new SimResult(resultValues(criteria, weights, consistency, ranking));
  }

  private static List<Criterion> criteria(Object value) {
    if (!(value instanceof List<?> values)) {
      throw simError("config.criteria must be an array");
    }
    if (values.size() < 2 || values.size() > MAX_CRITERIA) {
      throw simError("criteria count must be 2.." + MAX_CRITERIA);
    }
    var criteria = new ArrayList<Criterion>();
    for (var index = 0; index < values.size(); index++) {
      if (!(values.get(index) instanceof Map<?, ?> item)) {
        throw simError("config.criteria[" + index + "] must be an object");
      }
      var label = "config.criteria[" + index + "]";
      criteria.add(
          new Criterion(
              requiredText(item, "field", label), direction(item.get("direction"), label)));
    }
    return List.copyOf(criteria);
  }

  private static double[][] comparisonMatrix(Object value, int size) {
    if (!(value instanceof List<?> rows) || rows.size() != size) {
      throw simError("comparisonMatrix must be square and match criteria count");
    }
    var matrix = new double[size][size];
    for (var row = 0; row < size; row++) {
      if (!(rows.get(row) instanceof List<?> columns) || columns.size() != size) {
        throw simError("comparisonMatrix must be square and match criteria count");
      }
      for (var column = 0; column < size; column++) {
        matrix[row][column] =
            positiveNumber(columns.get(column), "comparisonMatrix[" + row + "][" + column + "]");
      }
    }
    validateMatrix(matrix);
    return matrix;
  }

  private static void validateMatrix(double[][] matrix) {
    for (var row = 0; row < matrix.length; row++) {
      if (Math.abs(matrix[row][row] - 1.0d) > MATRIX_TOLERANCE) {
        throw simError("comparisonMatrix diagonal must be 1");
      }
      for (var column = row + 1; column < matrix.length; column++) {
        if (Math.abs(matrix[row][column] * matrix[column][row] - 1.0d) > MATRIX_TOLERANCE) {
          throw simError("comparisonMatrix must be reciprocal");
        }
      }
    }
  }

  private static double consistencyThreshold(Object value) {
    if (value == null) return DEFAULT_CONSISTENCY_THRESHOLD;
    var threshold = nonNegativeNumber(value, "consistencyThreshold");
    if (!Double.isFinite(threshold)) {
      throw simError("consistencyThreshold must be finite");
    }
    return threshold;
  }

  private static double[] weights(double[][] matrix) {
    var geometricMeans = new double[matrix.length];
    var sum = 0.0d;
    for (var row = 0; row < matrix.length; row++) {
      var product = 1.0d;
      for (var column = 0; column < matrix.length; column++) {
        product *= matrix[row][column];
      }
      geometricMeans[row] = Math.pow(product, 1.0d / matrix.length);
      sum += geometricMeans[row];
    }
    var weights = new double[matrix.length];
    for (var index = 0; index < weights.length; index++) {
      weights[index] = geometricMeans[index] / sum;
    }
    return weights;
  }

  private static Consistency consistency(double[][] matrix, double[] weights, double threshold) {
    if (matrix.length <= 2) return new Consistency(0.0d, 0.0d, true);
    var lambdaSum = 0.0d;
    for (var row = 0; row < matrix.length; row++) {
      var weightedSum = 0.0d;
      for (var column = 0; column < matrix.length; column++) {
        weightedSum += matrix[row][column] * weights[column];
      }
      lambdaSum += weightedSum / weights[row];
    }
    var lambdaMax = lambdaSum / matrix.length;
    var consistencyIndex = (lambdaMax - matrix.length) / (matrix.length - 1.0d);
    var randomIndex = RANDOM_INDEX[matrix.length];
    var consistencyRatio = randomIndex == 0.0d ? 0.0d : consistencyIndex / randomIndex;
    return new Consistency(lambdaMax, consistencyRatio, consistencyRatio <= threshold);
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

  private static List<Score> scores(
      List<DataObject> candidates, List<Criterion> criteria, double[] weights) {
    var values = decisionMatrix(candidates, criteria);
    var normalized = normalized(values, criteria);
    var scores = new ArrayList<Score>();
    for (var row = 0; row < candidates.size(); row++) {
      var score = 0.0d;
      for (var column = 0; column < criteria.size(); column++) {
        score += weights[column] * normalized[row][column];
      }
      scores.add(new Score(candidates.get(row).objectId(), score, row));
    }
    return List.copyOf(scores);
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

  private Map<String, Object> resultValues(
      List<Criterion> criteria,
      double[] weights,
      Consistency consistency,
      List<Map<String, Object>> ranking) {
    var values = new LinkedHashMap<String, Object>();
    values.put("engineId", engineId());
    values.put("criteriaWeights", criteriaWeights(criteria, weights));
    values.put("consistencyRatio", consistency.consistencyRatio());
    values.put("consistent", consistency.consistent());
    values.put("lambdaMax", consistency.lambdaMax());
    values.put("ranking", ranking);
    values.put("bestCandidateId", ranking.getFirst().get("candidateId"));
    return Map.copyOf(values);
  }

  private static List<Map<String, Object>> criteriaWeights(
      List<Criterion> criteria, double[] weights) {
    var result = new ArrayList<Map<String, Object>>();
    for (var index = 0; index < criteria.size(); index++) {
      var item = new LinkedHashMap<String, Object>();
      item.put("field", criteria.get(index).field());
      item.put("weight", weights[index]);
      result.add(Map.copyOf(item));
    }
    return List.copyOf(result);
  }

  private static Direction direction(Object value, String label) {
    if (!(value instanceof String text) || text.isBlank()) {
      throw simError(label + ".direction must be benefit or cost");
    }
    return switch (text) {
      case "benefit" -> Direction.BENEFIT;
      case "cost" -> Direction.COST;
      default -> throw simError(label + ".direction must be benefit or cost");
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

  private static double positiveNumber(Object value, String label) {
    var number = number(value, label);
    if (number <= 0.0d) {
      throw simError(label + " must be positive");
    }
    return number;
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

  private record Criterion(String field, Direction direction) {}

  private record Consistency(double lambdaMax, double consistencyRatio, boolean consistent) {}

  private record Score(String candidateId, double score, int sourceIndex) {}
}
