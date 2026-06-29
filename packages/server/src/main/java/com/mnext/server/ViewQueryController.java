package com.mnext.server;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@RestController
public class ViewQueryController {
  private static final int MAX_RECOMMENDATION_CANDIDATES = 500;
  private static final String TOPSIS_ENGINE_ID = "decision-topsis";
  private static final String AHP_ENGINE_ID = "decision-ahp";
  private static final String WPM_ENGINE_ID = "decision-wpm";
  private final ReadModelRepository repository;
  private final CheckResultRepository checkResults;
  private final ObjectProvider<DerivedEvaluator> derivedEvaluator;
  private final DerivedFieldRepository derivedFields;
  private final SimulationRunRepository simulationRuns;
  private final SimResultSeriesRepository simResultSeries;
  private final LineageQueryRepository lineageQueries;
  private final WorkspaceAuthorizer authorizer;
  private final WorkspaceQueryRepository workspaces;
  private final TransformationRepository transformations;
  private final ReusableAssemblyRepository reusableAssemblies;
  private final VerificationCoverageRepository verificationCoverage;

  public ViewQueryController(
      ReadModelRepository repository,
      CheckResultRepository checkResults,
      ObjectProvider<DerivedEvaluator> derivedEvaluator,
      DerivedFieldRepository derivedFields,
      @Nullable SimulationRunRepository simulationRuns,
      SimResultSeriesRepository simResultSeries,
      LineageQueryRepository lineageQueries,
      WorkspaceAuthorizer authorizer,
      WorkspaceQueryRepository workspaces,
      TransformationRepository transformations,
      ReusableAssemblyRepository reusableAssemblies,
      VerificationCoverageRepository verificationCoverage) {
    this.repository = repository;
    this.checkResults = checkResults;
    this.derivedEvaluator = derivedEvaluator;
    this.derivedFields = derivedFields;
    this.simulationRuns = simulationRuns;
    this.simResultSeries = simResultSeries;
    this.lineageQueries = lineageQueries;
    this.authorizer = authorizer;
    this.workspaces = workspaces;
    this.transformations = transformations;
    this.reusableAssemblies = reusableAssemblies;
    this.verificationCoverage = verificationCoverage;
  }

  @GetMapping("/views/workspaces")
  public List<WorkspaceSummaryView> workspaces() {
    return workspaces.visibleWorkspaces(actorId());
  }

  @GetMapping("/workspaces/{workspaceId}/views/object-types")
  public List<ObjectTypeView> objectTypes(@PathVariable("workspaceId") UUID workspaceId) {
    authorize(workspaceId);
    return repository.objectTypes(workspaceId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/objects")
  public PageView<ObjectView> objects(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("objectType") String objectType,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "pageSize", defaultValue = "50") int pageSize) {
    authorize(workspaceId);
    if (objectType.isBlank()) throw new IllegalArgumentException("objectType 必填");
    if (page < 0 || pageSize < 1 || pageSize > 200) {
      throw new IllegalArgumentException("page 必须非负且 pageSize 必须为 1..200");
    }
    return withRuleStatuses(
        workspaceId,
        withDerivedValues(
            workspaceId, repository.objects(workspaceId, objectType, page, pageSize)));
  }

  @GetMapping("/workspaces/{workspaceId}/views/objects/{objectId}")
  public ObjectDetailView object(
      @PathVariable("workspaceId") UUID workspaceId, @PathVariable("objectId") UUID objectId) {
    authorize(workspaceId);
    var detail = repository.object(workspaceId, objectId);
    return new ObjectDetailView(
        withRuleStatus(
            withDerivedValues(workspaceId, detail.object()),
            ruleStatuses(workspaceId, List.of(objectId))),
        detail.relations());
  }

  @GetMapping("/workspaces/{workspaceId}/views/rule-status")
  public List<RuleStatusView> ruleStatus(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("objectIds") List<UUID> objectIds) {
    authorize(workspaceId);
    if (objectIds.size() > 200) throw new IllegalArgumentException("objectIds 最多 200 个");
    var statuses = ruleStatuses(workspaceId, objectIds);
    return objectIds.stream()
        .distinct()
        .map(objectId -> new RuleStatusView(objectId, statuses.getOrDefault(objectId, "UNKNOWN")))
        .toList();
  }

  @GetMapping("/workspaces/{workspaceId}/views/lineage")
  public LineageView lineage(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("objectId") UUID objectId,
      @RequestParam("fieldCode") String fieldCode) {
    authorize(workspaceId);
    if (fieldCode.isBlank()) throw new IllegalArgumentException("fieldCode 必填");
    return lineageQueries.lineage(workspaceId, objectId, fieldCode);
  }

  @GetMapping("/workspaces/{workspaceId}/views/relations")
  public List<RelationView> relations(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("relationType") String relationType,
      @RequestParam("direction") String direction,
      @RequestParam("sourceId") UUID sourceId,
      @RequestParam(value = "depth", defaultValue = "1") int depth) {
    authorize(workspaceId);
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
    authorize(workspaceId);
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
    authorize(workspaceId);
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
    authorize(workspaceId);
    return repository.syncStatus(workspaceId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/sim-runs")
  public PageView<SimRunSummaryView> simRuns(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    authorize(workspaceId);
    if (page < 0 || size < 1 || size > 50) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..50");
    }
    return simulationRuns.listSummaries(workspaceId, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/views/sim-runs/{runId}/series")
  public PageView<SimResultSeriesPointView> simRunSeries(
      @PathVariable("workspaceId") UUID workspaceId,
      @PathVariable("runId") UUID runId,
      @RequestParam(value = "object", required = false) UUID objectId,
      @RequestParam(value = "field", required = false) String fieldCode,
      @RequestParam(value = "from", required = false) Double from,
      @RequestParam(value = "to", required = false) Double to,
      @RequestParam(value = "downsample", defaultValue = "1") int downsample,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "200") int size) {
    authorize(workspaceId);
    if (from != null && to != null && from > to) {
      throw new IllegalArgumentException("from 必须小于等于 to");
    }
    return simResultSeries.find(
        workspaceId, runId, objectId, fieldCode, from, to, downsample, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/views/correspondences")
  public PageView<CorrespondenceView> correspondences(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("objectId") UUID objectId,
      @RequestParam("relationType") String relationType,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    authorize(workspaceId);
    if (relationType.isBlank()) throw new IllegalArgumentException("relationType 必填");
    if (page < 0 || size < 1 || size > 200) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..200");
    }
    return repository.correspondences(workspaceId, objectId, relationType, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/views/mapping-profiles")
  public List<MappingProfileView> mappingProfiles(@PathVariable("workspaceId") UUID workspaceId) {
    authorize(workspaceId);
    return transformations.mappingProfiles(workspaceId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/reusable-assemblies")
  public PageView<ReusableAssemblyView> reusableAssemblies(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "profile", required = false) String profile,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    authorize(workspaceId);
    return reusableAssemblies.list(workspaceId, profile, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/views/mapping/correspondences")
  public List<MappingCorrespondenceView> mappingCorrespondences(
      @PathVariable("workspaceId") UUID workspaceId) {
    authorize(workspaceId);
    return repository.mappingCorrespondences(workspaceId);
  }

  @GetMapping("/workspaces/{workspaceId}/views/mapping/correspondences/{correspondenceId}/coverage")
  public MappingCoveragePageView mappingCoverage(
      @PathVariable("workspaceId") UUID workspaceId,
      @PathVariable("correspondenceId") UUID correspondenceId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "30") int size) {
    authorize(workspaceId);
    if (page < 0 || size < 1 || size > 50) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..50");
    }
    return repository.mappingCoverage(workspaceId, correspondenceId, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/views/verification-coverage")
  public VerificationCoverageView verificationCoverage(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "scope", required = false) String scope,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "30") int size) {
    authorize(workspaceId);
    if (scope != null && scope.isBlank()) throw new IllegalArgumentException("scope 不能为空白");
    if (page < 0 || size < 1 || size > 100) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..100");
    }
    return verificationCoverage.coverage(workspaceId, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/views/recommendations")
  public RecommendationView recommendations(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("projectId") UUID projectId,
      @RequestParam("relationTypeCode") String relationTypeCode,
      @RequestParam(value = "scoreField", required = false) String scoreField,
      @RequestParam(value = "method", defaultValue = "weighted") String method,
      @RequestParam(value = "order", defaultValue = "desc") String order,
      @RequestParam(value = "size", defaultValue = "10") int size,
      @RequestParam(value = "ruleRunId", required = false) UUID ruleRunId) {
    authorize(workspaceId);
    if (relationTypeCode.isBlank()) throw new IllegalArgumentException("relationTypeCode 必填");
    if (!Set.of("weighted", "topsis", "ahp", "wpm").contains(method)) {
      throw new IllegalArgumentException("method 必须为 weighted、topsis、ahp 或 wpm");
    }
    if (!Set.of("asc", "desc").contains(order)) {
      throw new IllegalArgumentException("order 必须为 asc 或 desc");
    }
    if (size < 1 || size > 200) throw new IllegalArgumentException("size 必须为 1..200");
    if ("topsis".equals(method)) {
      return topsisRecommendation(workspaceId, projectId, relationTypeCode, size, ruleRunId);
    }
    if ("ahp".equals(method)) {
      return ahpRecommendation(workspaceId, projectId, relationTypeCode, size, ruleRunId);
    }
    if ("wpm".equals(method)) {
      return wpmRecommendation(workspaceId, projectId, relationTypeCode, size, ruleRunId);
    }
    if (scoreField == null || scoreField.isBlank())
      throw new IllegalArgumentException("scoreField 必填");
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
            .toList();
    var result = new ArrayList<RankedCandidate>();
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
    return recommendationView(workspaceId, ruleRunId, result, size);
  }

  @GetMapping("/workspaces/{workspaceId}/views/check-results")
  public PageView<CheckResultView> checkResults(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("runId") UUID runId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    authorize(workspaceId);
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

  private void authorize(UUID workspaceId) {
    authorizer.require(actorId(), workspaceId, WorkspaceAuthorizer.Action.READ);
  }

  private String actorId() {
    var attributes = RequestContextHolder.getRequestAttributes();
    return attributes instanceof ServletRequestAttributes servlet
        ? servlet.getRequest().getHeader("X-Actor-Id")
        : null;
  }

  private PageView<ObjectView> withRuleStatuses(UUID workspaceId, PageView<ObjectView> page) {
    var statuses =
        ruleStatuses(workspaceId, page.items().stream().map(ObjectView::objectId).toList());
    return new PageView<>(
        page.items().stream().map(object -> withRuleStatus(object, statuses)).toList(),
        page.page(),
        page.pageSize(),
        page.total());
  }

  private Map<UUID, String> ruleStatuses(UUID workspaceId, List<UUID> objectIds) {
    return checkResults.latestRuleStatuses(workspaceId, objectIds);
  }

  private static ObjectView withRuleStatus(ObjectView object, Map<UUID, String> statuses) {
    return new ObjectView(
        object.objectId(),
        object.objectType(),
        object.status(),
        object.version(),
        object.fields(),
        object.updatedAt(),
        object.source(),
        object.derived(),
        statuses.getOrDefault(object.objectId(), "UNKNOWN"));
  }

  private PageView<ObjectView> withDerivedValues(UUID workspaceId, PageView<ObjectView> page) {
    var codesByType = new HashMap<String, List<String>>();
    return new PageView<>(
        page.items().stream()
            .map(object -> withDerivedValues(workspaceId, object, codesByType))
            .toList(),
        page.page(),
        page.pageSize(),
        page.total());
  }

  private ObjectView withDerivedValues(UUID workspaceId, ObjectView object) {
    return withDerivedValues(workspaceId, object, new HashMap<>());
  }

  private ObjectView withDerivedValues(
      UUID workspaceId, ObjectView object, Map<String, List<String>> codesByType) {
    var codes =
        codesByType.computeIfAbsent(
            object.objectType(), type -> derivedFields.codesForObjectType(workspaceId, type));
    if (codes.isEmpty()) return object;
    var values = new LinkedHashMap<String, Object>();
    for (var code : codes) {
      try {
        var value = derivedEvaluator.getObject().evaluate(workspaceId, object.objectId(), code);
        if (value != null) values.put(code, value);
      } catch (RuntimeException failure) {
        // A single derived value must not make the whole read model query fail.
      }
    }
    return new ObjectView(
        object.objectId(),
        object.objectType(),
        object.status(),
        object.version(),
        object.fields(),
        object.updatedAt(),
        object.source(),
        Map.copyOf(values),
        object.ruleStatus());
  }

  private RecommendationView recommendationView(
      UUID workspaceId, UUID ruleRunId, List<RankedCandidate> ranked, int size) {
    var resolvedRunId = ruleRunId(workspaceId, ruleRunId);
    if (resolvedRunId.isEmpty()) {
      return recommendationView(ranked, List.of(), size);
    }
    var candidateIds = ranked.stream().map(RankedCandidate::candidateId).toList();
    var checksByObject = new HashMap<UUID, List<CheckResultView>>();
    for (var result : checkResults.findForObjects(workspaceId, resolvedRunId.get(), candidateIds)) {
      checksByObject.computeIfAbsent(result.objectId(), ignored -> new ArrayList<>()).add(result);
    }
    var active = new ArrayList<RankedCandidate>();
    var vetoed = new ArrayList<RankedCandidate>();
    for (var candidate : ranked) {
      var checks = checksByObject.getOrDefault(candidate.candidateId(), List.of());
      var risks = checks.stream().map(ViewQueryController::risk).toList();
      var blocked = checks.stream().anyMatch(check -> "BLOCK".equals(check.severity()));
      if (blocked) {
        vetoed.add(candidate(candidate, false, risks, true));
      } else {
        active.add(candidate(candidate, false, risks, false));
      }
    }
    return recommendationView(active, vetoed, size);
  }

  private Optional<UUID> ruleRunId(UUID workspaceId, UUID ruleRunId) {
    if (ruleRunId == null) return checkResults.latestRunId(workspaceId);
    if (!checkResults.runExists(workspaceId, ruleRunId)) {
      throw new IllegalArgumentException("ruleRunId 不存在或不属于当前工作空间");
    }
    return Optional.of(ruleRunId);
  }

  private RecommendationView recommendationView(
      List<RankedCandidate> ranked, List<RankedCandidate> vetoed, int size) {
    var selected = new ArrayList<RankedCandidate>();
    for (var candidate : ranked) {
      if (selected.size() >= size) break;
      selected.add(candidate(candidate, selected.isEmpty(), candidate.risks(), false));
    }
    return new RecommendationView(
        selected.isEmpty() ? null : selected.getFirst(),
        selected.size() <= 1 ? List.of() : List.copyOf(selected.subList(1, selected.size())),
        List.copyOf(vetoed));
  }

  private static RankedCandidate candidate(
      RankedCandidate candidate,
      boolean recommended,
      List<RecommendationRisk> risks,
      boolean vetoed) {
    return new RankedCandidate(
        candidate.candidateId(),
        candidate.objectTypeCode(),
        candidate.score(),
        candidate.rank(),
        recommended,
        candidate.fields(),
        candidate.details(),
        risks,
        vetoed);
  }

  private static RecommendationRisk risk(CheckResultView result) {
    return new RecommendationRisk(result.ruleCode(), result.severity(), result.message());
  }

  private RecommendationView topsisRecommendation(
      UUID workspaceId, UUID projectId, String relationTypeCode, int size, UUID ruleRunId) {
    var runResult =
        simulationRuns
            .latestCompletedResult(workspaceId, TOPSIS_ENGINE_ID)
            .orElseThrow(
                () ->
                    new SimulationException(
                        "REC-409-NO-METHOD-RUN",
                        "先对该项目跑一次 decision-topsis 方法再看推荐",
                        "先对该项目跑一次 decision-topsis 方法再看推荐"));
    var candidates =
        repository.recommendationCandidates(
            workspaceId, projectId, relationTypeCode, MAX_RECOMMENDATION_CANDIDATES + 1);
    if (candidates.size() > MAX_RECOMMENDATION_CANDIDATES) {
      throw new IllegalArgumentException("候选数量超过 500，请收窄比选范围");
    }
    var candidatesById = new HashMap<UUID, ObjectView>();
    candidates.forEach(candidate -> candidatesById.put(candidate.objectId(), candidate));
    var result = new ArrayList<RankedCandidate>();
    if (runResult.get("ranking") instanceof List<?> ranking) {
      for (var item : ranking) {
        var ranked = topsisCandidate(item, candidatesById, result.size() + 1);
        if (ranked != null) result.add(ranked);
      }
    }
    return recommendationView(workspaceId, ruleRunId, result, size);
  }

  private RankedCandidate topsisCandidate(
      Object item, Map<UUID, ObjectView> candidatesById, int rank) {
    if (!(item instanceof Map<?, ?> ranking)) return null;
    var candidateId = uuid(ranking.get("candidateId"));
    if (candidateId == null) return null;
    var candidate = candidatesById.get(candidateId);
    if (candidate == null) return null;
    return new RankedCandidate(
        candidate.objectId(),
        candidate.objectType(),
        numericScore(ranking.get("closeness")),
        rank,
        rank == 1,
        candidate.fields(),
        "method=topsis");
  }

  private RecommendationView wpmRecommendation(
      UUID workspaceId, UUID projectId, String relationTypeCode, int size, UUID ruleRunId) {
    var runResult =
        simulationRuns
            .latestCompletedResult(workspaceId, WPM_ENGINE_ID)
            .orElseThrow(
                () ->
                    new SimulationException(
                        "REC-409-NO-METHOD-RUN",
                        "先对该项目跑一次 decision-wpm 方法再看推荐",
                        "先对该项目跑一次 decision-wpm 方法再看推荐"));
    var candidates =
        repository.recommendationCandidates(
            workspaceId, projectId, relationTypeCode, MAX_RECOMMENDATION_CANDIDATES + 1);
    if (candidates.size() > MAX_RECOMMENDATION_CANDIDATES) {
      throw new IllegalArgumentException("候选数量超过 500，请收窄比选范围");
    }
    var candidatesById = new HashMap<UUID, ObjectView>();
    candidates.forEach(candidate -> candidatesById.put(candidate.objectId(), candidate));
    var result = new ArrayList<RankedCandidate>();
    if (runResult.get("ranking") instanceof List<?> ranking) {
      for (var item : ranking) {
        var ranked = wpmCandidate(item, candidatesById, result.size() + 1);
        if (ranked != null) result.add(ranked);
      }
    }
    return recommendationView(workspaceId, ruleRunId, result, size);
  }

  private RecommendationView ahpRecommendation(
      UUID workspaceId, UUID projectId, String relationTypeCode, int size, UUID ruleRunId) {
    var runResult =
        simulationRuns
            .latestCompletedResult(workspaceId, AHP_ENGINE_ID)
            .orElseThrow(
                () ->
                    new SimulationException(
                        "REC-409-NO-METHOD-RUN",
                        "先对该项目跑一次 decision-ahp 方法再看推荐",
                        "先对该项目跑一次 decision-ahp 方法再看推荐"));
    var candidates =
        repository.recommendationCandidates(
            workspaceId, projectId, relationTypeCode, MAX_RECOMMENDATION_CANDIDATES + 1);
    if (candidates.size() > MAX_RECOMMENDATION_CANDIDATES) {
      throw new IllegalArgumentException("候选数量超过 500，请收窄比选范围");
    }
    var candidatesById = new HashMap<UUID, ObjectView>();
    candidates.forEach(candidate -> candidatesById.put(candidate.objectId(), candidate));
    var result = new ArrayList<RankedCandidate>();
    if (runResult.get("ranking") instanceof List<?> ranking) {
      for (var item : ranking) {
        var ranked = ahpCandidate(item, candidatesById, result.size() + 1);
        if (ranked != null) result.add(ranked);
      }
    }
    return recommendationView(workspaceId, ruleRunId, result, size);
  }

  private RankedCandidate ahpCandidate(
      Object item, Map<UUID, ObjectView> candidatesById, int rank) {
    if (!(item instanceof Map<?, ?> ranking)) return null;
    var candidateId = uuid(ranking.get("candidateId"));
    if (candidateId == null) return null;
    var candidate = candidatesById.get(candidateId);
    if (candidate == null) return null;
    return new RankedCandidate(
        candidate.objectId(),
        candidate.objectType(),
        numericScore(ranking.get("score")),
        rank,
        rank == 1,
        candidate.fields(),
        "method=ahp");
  }

  private RankedCandidate wpmCandidate(
      Object item, Map<UUID, ObjectView> candidatesById, int rank) {
    if (!(item instanceof Map<?, ?> ranking)) return null;
    var candidateId = uuid(ranking.get("candidateId"));
    if (candidateId == null) return null;
    var candidate = candidatesById.get(candidateId);
    if (candidate == null) return null;
    return new RankedCandidate(
        candidate.objectId(),
        candidate.objectType(),
        numericScore(ranking.get("score")),
        rank,
        rank == 1,
        candidate.fields(),
        "method=wpm");
  }

  private static UUID uuid(Object value) {
    if (value instanceof UUID id) return id;
    if (!(value instanceof String text) || text.isBlank()) return null;
    try {
      return UUID.fromString(text);
    } catch (IllegalArgumentException ignored) {
      return null;
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
