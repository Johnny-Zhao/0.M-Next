package com.mnext.server;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ViewQueryController {
  private static final int MAX_RECOMMENDATION_CANDIDATES = 500;
  private final ReadModelRepository repository;
  private final CheckResultRepository checkResults;
  private final ObjectProvider<DerivedEvaluator> derivedEvaluator;

  public ViewQueryController(
      ReadModelRepository repository,
      CheckResultRepository checkResults,
      ObjectProvider<DerivedEvaluator> derivedEvaluator) {
    this.repository = repository;
    this.checkResults = checkResults;
    this.derivedEvaluator = derivedEvaluator;
  }

  @GetMapping("/workspaces/{workspaceId}/views/object-types")
  public List<ObjectTypeView> objectTypes(@PathVariable("workspaceId") UUID workspaceId) {
    return repository.objectTypes(workspaceId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/objects")
  public PageView<ObjectView> objects(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("objectType") String objectType,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "pageSize", defaultValue = "50") int pageSize) {
    if (objectType.isBlank()) throw new IllegalArgumentException("objectType 必填");
    if (page < 0 || pageSize < 1 || pageSize > 200) {
      throw new IllegalArgumentException("page 必须非负且 pageSize 必须为 1..200");
    }
    return repository.objects(workspaceId, objectType, page, pageSize);
  }

  @GetMapping("/workspaces/{workspaceId}/views/objects/{objectId}")
  public ObjectDetailView object(
      @PathVariable("workspaceId") UUID workspaceId, @PathVariable("objectId") UUID objectId) {
    return repository.object(workspaceId, objectId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/relations")
  public List<RelationView> relations(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("relationType") String relationType,
      @RequestParam("direction") String direction,
      @RequestParam("sourceId") UUID sourceId,
      @RequestParam(value = "depth", defaultValue = "1") int depth) {
    if (relationType.isBlank() || !Set.of("out", "in").contains(direction)) {
      throw new IllegalArgumentException("relationType 与 direction(out|in) 必填");
    }
    if (depth < 1 || depth > 5) throw new IllegalArgumentException("depth 必须为 1..5");
    return repository.relations(workspaceId, relationType, direction, sourceId, depth);
  }

  @GetMapping("/workspaces/{workspaceId}/views/tree")
  public List<TreeNodeView> tree(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("relationType") String relationType,
      @RequestParam("rootId") UUID rootId) {
    if (!repository.hierarchicalRelationType(workspaceId, relationType)) {
      throw new IllegalArgumentException("tree relationType 必须为 hierarchical");
    }
    return repository.tree(workspaceId, relationType, rootId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/matrix")
  public MatrixView matrix(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("rowType") String rowType,
      @RequestParam("colType") String colType,
      @RequestParam("relationType") String relationType,
      @RequestParam(value = "rowPage", defaultValue = "0") int rowPage,
      @RequestParam(value = "rowSize", defaultValue = "50") int rowSize,
      @RequestParam(value = "colPage", defaultValue = "0") int colPage,
      @RequestParam(value = "colSize", defaultValue = "50") int colSize) {
    if (rowType.isBlank() || colType.isBlank() || relationType.isBlank()) {
      throw new IllegalArgumentException("rowType、colType 与 relationType 必填");
    }
    if (rowPage < 0 || colPage < 0 || rowSize < 1 || colSize < 1) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为正数");
    }
    return repository.matrix(
        workspaceId,
        rowType,
        colType,
        relationType,
        rowPage,
        Math.min(rowSize, 50),
        colPage,
        Math.min(colSize, 50));
  }

  @GetMapping("/workspaces/{workspaceId}/views/sync-status")
  public SyncStatusView syncStatus(@PathVariable("workspaceId") UUID workspaceId) {
    return repository.syncStatus(workspaceId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/correspondences")
  public PageView<CorrespondenceView> correspondences(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("objectId") UUID objectId,
      @RequestParam("relationType") String relationType,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    if (relationType.isBlank()) throw new IllegalArgumentException("relationType 必填");
    if (page < 0 || size < 1 || size > 200) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..200");
    }
    return repository.correspondences(workspaceId, objectId, relationType, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/views/recommendations")
  public RecommendationView recommendations(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("projectId") UUID projectId,
      @RequestParam("relationTypeCode") String relationTypeCode,
      @RequestParam("scoreField") String scoreField,
      @RequestParam(value = "order", defaultValue = "desc") String order,
      @RequestParam(value = "size", defaultValue = "10") int size) {
    if (relationTypeCode.isBlank()) throw new IllegalArgumentException("relationTypeCode 必填");
    if (scoreField.isBlank()) throw new IllegalArgumentException("scoreField 必填");
    if (!Set.of("asc", "desc").contains(order)) {
      throw new IllegalArgumentException("order 必须为 asc 或 desc");
    }
    if (size < 1 || size > 200) throw new IllegalArgumentException("size 必须为 1..200");
    var candidates =
        repository.recommendationCandidates(
            workspaceId, projectId, relationTypeCode, MAX_RECOMMENDATION_CANDIDATES + 1);
    if (candidates.size() > MAX_RECOMMENDATION_CANDIDATES) {
      throw new IllegalArgumentException("候选数量超过 500，请收窄比选范围");
    }
    var ranked =
        candidates.stream()
            .map(candidate -> scoredCandidate(workspaceId, scoreField, candidate))
            .sorted(scoreComparator(order).thenComparing(candidate -> candidate.objectId()))
            .limit(size)
            .toList();
    var result = new java.util.ArrayList<RankedCandidate>();
    for (int index = 0; index < ranked.size(); index++) {
      var candidate = ranked.get(index);
      result.add(
          new RankedCandidate(
              candidate.objectId(),
              candidate.objectTypeCode(),
              candidate.score(),
              index + 1,
              index == 0,
              candidate.fields(),
              candidate.details()));
    }
    return new RecommendationView(
        result.isEmpty() ? null : result.getFirst(),
        result.size() <= 1 ? List.of() : List.copyOf(result.subList(1, result.size())));
  }

  @GetMapping("/workspaces/{workspaceId}/views/check-results")
  public PageView<CheckResultView> checkResults(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("runId") UUID runId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    if (page < 0 || size < 1 || size > 200) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..200");
    }
    return checkResults.find(workspaceId, runId, page, size);
  }

  private ScoredCandidate scoredCandidate(
      UUID workspaceId, String scoreField, ObjectView candidate) {
    try {
      var value =
          numericScore(
              derivedEvaluator.getObject().evaluate(workspaceId, candidate.objectId(), scoreField));
      return new ScoredCandidate(
          candidate.objectId(),
          candidate.objectType(),
          value,
          candidate.fields(),
          value == null ? "score_null_or_non_numeric" : null);
    } catch (RuntimeException failure) {
      return new ScoredCandidate(
          candidate.objectId(),
          candidate.objectType(),
          null,
          candidate.fields(),
          "score_evaluation_failed");
    }
  }

  private static BigDecimal numericScore(Object value) {
    if (value instanceof BigDecimal decimal) return decimal;
    if (value instanceof Number number) return new BigDecimal(number.toString());
    if (!(value instanceof String text) || text.isBlank()) return null;
    try {
      return new BigDecimal(text);
    } catch (NumberFormatException ignored) {
      return null;
    }
  }

  private static Comparator<ScoredCandidate> scoreComparator(String order) {
    var scoreOrder =
        "desc".equals(order)
            ? Comparator.<BigDecimal>nullsLast(Comparator.reverseOrder())
            : Comparator.<BigDecimal>nullsLast(Comparator.naturalOrder());
    return Comparator.comparing(ScoredCandidate::score, scoreOrder);
  }

  private record ScoredCandidate(
      UUID objectId,
      String objectTypeCode,
      BigDecimal score,
      java.util.Map<String, Object> fields,
      String details) {}
}
