package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"mnext.readmodel.enabled=false", "mnext.outbox.poll-delay=60000"})
class BidComparisonE2EIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final BigDecimal PRICE_WEIGHT = new BigDecimal("0.5");
  private static final BigDecimal QUALITY_WEIGHT = new BigDecimal("0.3");
  private static final BigDecimal DELIVERY_WEIGHT = new BigDecimal("0.2");
  private static final BigDecimal SCORE_TOLERANCE = new BigDecimal("0.000001");

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired TestRestTemplate http;
  @Autowired DerivedEvaluator derivedEvaluator;
  @Autowired OutboxRelay outbox;
  @Autowired TransactionTemplate transactions;
  @LocalServerPort int port;
  private TestOutboxRelay relay;

  @BeforeEach
  void setUp() {
    relay = new TestOutboxRelay(outbox, transactions);
  }

  @Test
  void bidComparisonProfileClosesWeightedDecisionLoopThroughPureApi() {
    assertEquals(
        0, BigDecimal.ONE.compareTo(PRICE_WEIGHT.add(QUALITY_WEIGHT).add(DELIVERY_WEIGHT)));

    var template = createTemplate();
    var profile = defineProfile(template.versionId());
    assertOk(meta(AUTHOR, publishTemplate(template.versionId(), "publish-bid-profile")));
    var instantiatedWorkspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(template.templateId(), instantiatedWorkspace, "instantiate-bid-profile")));
    assertInstantiatedProfile(instantiatedWorkspace);

    var project =
        createObject(AUTHOR, profile.projectTypeId(), "create-bid-project", Map.of("budget", 100));
    var projectId = onlyObject(AUTHOR, "comparison_project").objectId();
    createCandidate(profile.candidateTypeId(), "alpha", 80, 95, 20);
    createCandidate(profile.candidateTypeId(), "beta", 95, 40, 55);
    createCandidate(profile.candidateTypeId(), "gamma", 120, 100, 10);
    var candidates = candidatesByName(AUTHOR);

    assertOk(
        command(
            AUTHOR,
            createRelation(
                AUTHOR,
                profile.projectHasCandidateRelationTypeId(),
                projectId,
                candidates.get("alpha").objectId(),
                "project-has-alpha")));
    assertOk(
        command(
            AUTHOR,
            createRelation(
                AUTHOR,
                profile.projectHasCandidateRelationTypeId(),
                projectId,
                candidates.get("beta").objectId(),
                "project-has-beta")));
    assertOk(
        command(
            AUTHOR,
            createRelation(
                AUTHOR,
                profile.projectHasCandidateRelationTypeId(),
                projectId,
                candidates.get("gamma").objectId(),
                "project-has-gamma")));
    drainReadModel();

    candidates = candidatesByName(AUTHOR);
    assertScores(candidates, Map.of("alpha", "0.518333", "beta", "0.161667", "gamma", "0.366667"));
    assertEquals(List.of("alpha", "gamma", "beta"), ranking(candidates));

    var initialRun = runId(rule(AUTHOR, runRuleCheck(AUTHOR, "run-bid-rules-initial")));
    var initialResults = checkResults(AUTHOR, initialRun);
    assertRule(initialResults, "price_over_budget", candidates.get("gamma").objectId());
    assertRule(initialResults, "total_score_low", candidates.get("beta").objectId());
    assertNoRule(initialResults, candidates.get("alpha").objectId());

    var beta = candidates.get("beta");
    var betaScoreBeforeUpdate = score(beta);
    assertOk(command(AUTHOR, updatePrice(AUTHOR, beta.objectId(), beta.version(), 40)));
    drainReadModel();

    var updated = candidatesByName(AUTHOR);
    assertScores(updated, Map.of("alpha", "0.518333", "beta", "0.436667", "gamma", "0.366667"));
    assertEquals(List.of("alpha", "beta", "gamma"), ranking(updated));
    assertTrue(score(updated.get("beta")).compareTo(betaScoreBeforeUpdate) > 0);

    var updatedRun = runId(rule(AUTHOR, runRuleCheck(AUTHOR, "run-bid-rules-after-price-cut")));
    var updatedResults = checkResults(AUTHOR, updatedRun);
    assertRule(updatedResults, "price_over_budget", updated.get("gamma").objectId());
    assertFalse(
        updatedResults.stream()
            .anyMatch(
                result ->
                    "total_score_low".equals(result.ruleCode())
                        && updated.get("beta").objectId().equals(result.objectId())));
    assertNoRule(updatedResults, updated.get("alpha").objectId());
  }

  private TemplateIds createTemplate() {
    var suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    var response =
        meta(
            AUTHOR,
            command(
                "CreateTemplate",
                AUTHOR,
                "create-bid-template-" + suffix,
                Map.of("code", "bid_comparison_" + suffix, "name", "Bid Comparison")));
    return new TemplateIds(detail(response, "templateId"), detail(response, "templateVersionId"));
  }

  private ProfileIds defineProfile(UUID version) {
    var project = defineObjectType(version, "comparison_project", "Comparison Project");
    var candidate = defineObjectType(version, "candidate", "Candidate");
    defineField(project, "budget", "Budget", "number", true);
    defineField(candidate, "name", "Name", "string", true);
    defineField(candidate, "price", "Price", "number", true);
    defineField(candidate, "quality", "Quality", "number", true);
    defineField(candidate, "delivery_days", "Delivery Days", "number", true);
    var relation =
        defineRelationType(
            version, "project_has_candidate", "Project Has Candidate", project, candidate);
    defineDerived(
        version,
        candidate,
        "score_price",
        "Score Price",
        "(sum(traverse('project_has_candidate','in'),'budget') - field('price'))"
            + " / sum(traverse('project_has_candidate','in'),'budget')");
    defineDerived(version, candidate, "score_quality", "Score Quality", "field('quality') / 100");
    defineDerived(
        version,
        candidate,
        "score_delivery",
        "Score Delivery",
        "(60 - field('delivery_days')) / 60");
    defineDerived(
        version,
        candidate,
        "total_score",
        "Total Score",
        "0.5 * field('score_price') + 0.3 * field('score_quality')"
            + " + 0.2 * field('score_delivery')");
    defineRule(version, "price_over_budget", "BLOCK", "field('score_price') < 0");
    defineRule(version, "total_score_low", "WARN", "field('total_score') < 0.35");
    return new ProfileIds(project, candidate, relation);
  }

  private UUID defineObjectType(UUID version, String code, String name) {
    return detail(
        meta(
            AUTHOR,
            command(
                "DefineObjectType",
                AUTHOR,
                "define-" + code,
                Map.of("templateVersionId", version, "code", code, "name", name))),
        "objectTypeId");
  }

  private UUID defineField(
      UUID objectType, String code, String name, String dataType, boolean required) {
    return detail(
        meta(
            AUTHOR,
            command(
                "DefineFieldDef",
                AUTHOR,
                "define-field-" + code,
                Map.of(
                    "objectTypeId", objectType,
                    "code", code,
                    "name", name,
                    "dataType", dataType,
                    "required", required))),
        "fieldDefId");
  }

  private UUID defineRelationType(
      UUID version, String code, String name, UUID sourceTypeId, UUID targetTypeId) {
    return detail(
        meta(
            AUTHOR,
            command(
                "DefineRelationType",
                AUTHOR,
                "define-" + code,
                Map.of(
                    "templateVersionId", version,
                    "code", code,
                    "name", name,
                    "sourceTypeId", sourceTypeId,
                    "targetTypeId", targetTypeId,
                    "direction", "directed",
                    "cardinality", "one_to_many",
                    "semantics", "weak",
                    "hierarchical", false))),
        "relationTypeId");
  }

  private void defineDerived(
      UUID version, UUID objectType, String code, String name, String derivation) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineDerivedField",
                AUTHOR,
                "define-derived-" + code,
                Map.of(
                    "templateVersionId", version,
                    "objectTypeId", objectType,
                    "code", code,
                    "name", name,
                    "resultType", "number",
                    "derivation", derivation))));
  }

  private void defineRule(UUID version, String code, String severity, String when) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateVersionId", version);
    payload.put("ruleCode", code);
    payload.put("scope", Map.of("objectTypeCode", "candidate"));
    payload.put("severity", severity);
    payload.put("when", when);
    payload.put("message", code + " ${field('price')}${field('total_score')}");
    payload.put("lightweight", false);
    assertOk(rule(AUTHOR, command("DefineRule", AUTHOR, "define-rule-" + code, payload)));
    assertOk(
        rule(
            AUTHOR,
            command("PublishRule", AUTHOR, "publish-rule-" + code, Map.of("ruleCode", code))));
  }

  private void createCandidate(UUID candidateType, String name, int price, int quality, int days) {
    createObject(
        AUTHOR,
        candidateType,
        "create-candidate-" + name,
        Map.of("name", name, "price", price, "quality", quality, "delivery_days", days));
  }

  private ObjectViewMap createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    assertOk(command(workspace, createObjectCommand(workspace, objectType, key, fields)));
    drainReadModel();
    return onlyObject(workspace, fields.containsKey("budget") ? "comparison_project" : "candidate");
  }

  private Map<String, Object> createObjectCommand(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    return command(
        "CreateObject",
        workspace,
        key,
        Map.of("objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
  }

  private Map<String, Object> createRelation(
      UUID workspace, UUID relationType, UUID source, UUID target, String key) {
    return command(
        "CreateRelation",
        workspace,
        key,
        Map.of(
            "relationTypeId", relationType,
            "sourceId", source,
            "targetId", target,
            "relationFields", Map.of(),
            "source", Map.of("type", "manual")));
  }

  private Map<String, Object> updatePrice(
      UUID workspace, UUID objectId, long expectedObjectVersion, int price) {
    return command(
        "UpdateFields",
        workspace,
        "update-beta-price",
        Map.of(
            "objectId", objectId,
            "expectedObjectVersion", expectedObjectVersion,
            "fields", List.of(Map.of("fieldDefCode", "price", "value", price))));
  }

  private Map<String, Object> publishTemplate(UUID version, String key) {
    return command("PublishTemplateVersion", AUTHOR, key, Map.of("templateVersionId", version));
  }

  private Map<String, Object> instantiate(UUID template, UUID workspace, String key) {
    return command(
        "InstantiateWorkspace",
        AUTHOR,
        key,
        Map.of(
            "templateId",
            template,
            "version",
            1,
            "newWorkspaceId",
            workspace,
            "workspaceName",
            "Bid Comparison Project"));
  }

  private Map<String, Object> runRuleCheck(UUID workspace, String key) {
    return command(
        "RunRuleCheck", workspace, key, Map.of("scope", Map.of("objectTypeCode", "candidate")));
  }

  private Map<String, Object> command(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", workspace);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", key);
    request.put("commandType", type);
    request.put("payload", payload);
    return request;
  }

  private void assertInstantiatedProfile(UUID workspace) {
    var types = getList(workspace, "/views/object-types");
    assertTrue(types.stream().anyMatch(type -> "comparison_project".equals(type.get("code"))));
    assertTrue(types.stream().anyMatch(type -> "candidate".equals(type.get("code"))));
  }

  private void assertScores(Map<String, ObjectViewMap> candidates, Map<String, String> expected) {
    expected.forEach((name, score) -> assertScore(score, score(candidates.get(name))));
  }

  private List<String> ranking(Map<String, ObjectViewMap> candidates) {
    return candidates.values().stream()
        .sorted(Comparator.comparing(this::score).reversed())
        .map(candidate -> String.valueOf(candidate.fields().get("name")))
        .toList();
  }

  private BigDecimal score(ObjectViewMap candidate) {
    var value = derivedEvaluator.evaluate(AUTHOR, candidate.objectId(), "total_score");
    assertTrue(value instanceof BigDecimal, "expected BigDecimal but got " + value);
    return (BigDecimal) value;
  }

  private void assertScore(String expected, BigDecimal actual) {
    var delta = actual.subtract(new BigDecimal(expected)).abs();
    assertTrue(
        delta.compareTo(SCORE_TOLERANCE) <= 0, "expected " + expected + " but got " + actual);
  }

  private String runId(ResponseEntity<Map> response) {
    assertOk(response);
    return String.valueOf(listValues(response.getBody(), "events").getFirst());
  }

  private void assertRule(List<CheckResultMap> results, String ruleCode, UUID objectId) {
    assertTrue(
        results.stream()
            .anyMatch(
                result -> ruleCode.equals(result.ruleCode()) && objectId.equals(result.objectId())),
        "missing " + ruleCode + " for " + objectId + ": " + results);
  }

  private void assertNoRule(List<CheckResultMap> results, UUID objectId) {
    assertFalse(
        results.stream().anyMatch(result -> objectId.equals(result.objectId())),
        "unexpected rule result for " + objectId + ": " + results);
  }

  private Map<String, ObjectViewMap> candidatesByName(UUID workspace) {
    return objects(workspace, "candidate").stream()
        .collect(
            java.util.stream.Collectors.toMap(
                object -> String.valueOf(object.fields().get("name")),
                object -> object,
                (left, right) -> right,
                LinkedHashMap::new));
  }

  private ObjectViewMap onlyObject(UUID workspace, String objectType) {
    var objects = objects(workspace, objectType);
    assertFalse(objects.isEmpty(), "missing object of type " + objectType);
    return objects.getLast();
  }

  private List<ObjectViewMap> objects(UUID workspace, String objectType) {
    drainReadModel();
    var response =
        get(workspace, "/views/objects?objectType=" + objectType + "&page=0&pageSize=20");
    return list(response, "items").stream().map(ObjectViewMap::new).toList();
  }

  private List<CheckResultMap> checkResults(UUID workspace, String runId) {
    var response = get(workspace, "/views/check-results?runId=" + runId + "&page=0&size=20");
    return list(response, "items").stream().map(CheckResultMap::new).toList();
  }

  private void drainReadModel() {
    for (var attempt = 0; attempt < 20; attempt++) {
      if (relay.drain() == 0) return;
    }
    fail("readmodel outbox did not drain within bounded attempts");
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> rule(UUID workspace, Object request) {
    return post(workspace, "/rule-commands", request);
  }

  private ResponseEntity<Map> command(UUID workspace, Object request) {
    return post(workspace, "/commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "bid-comparison-user");
    return http.postForEntity(
        base(workspace) + path, new HttpEntity<>(request, headers), Map.class);
  }

  private Map<String, Object> get(UUID workspace, String path) {
    var response = http.getForEntity(base(workspace) + path, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private List<Map<String, Object>> getList(UUID workspace, String path) {
    var response = http.getForEntity(base(workspace) + path, List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertNotNull(response.getBody());
  }

  private UUID detail(ResponseEntity<Map> response, String key) {
    assertOk(response);
    for (var value : listValues(response.getBody(), "events")) {
      var detail = String.valueOf(value);
      if (detail.startsWith(key + "=")) {
        return UUID.fromString(detail.substring((key + "=").length()));
      }
    }
    fail("missing detail " + key + " in " + response.getBody());
    return null;
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> list(Map<?, ?> response, String key) {
    return (List<Map<String, Object>>) response.get(key);
  }

  private List<?> listValues(Map<?, ?> response, String key) {
    return (List<?>) response.get(key);
  }

  private String base(UUID workspace) {
    return "http://localhost:" + port + "/workspaces/" + workspace;
  }

  private record TemplateIds(UUID templateId, UUID versionId) {}

  private record ProfileIds(
      UUID projectTypeId, UUID candidateTypeId, UUID projectHasCandidateRelationTypeId) {}

  private record ObjectViewMap(Map<String, Object> value) {
    UUID objectId() {
      return UUID.fromString(String.valueOf(value.get("objectId")));
    }

    long version() {
      return ((Number) value.get("version")).longValue();
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> fields() {
      return (Map<String, Object>) value.get("fields");
    }
  }

  private record CheckResultMap(Map<String, Object> value) {
    String ruleCode() {
      return String.valueOf(value.get("ruleCode"));
    }

    UUID objectId() {
      return UUID.fromString(String.valueOf(value.get("objectId")));
    }
  }

  @TestConfiguration
  static class ReadModelOutboxTestConfig {
    @Bean
    @Primary
    OutboxPublisher readModelOutboxPublisher(ReadModelProjection projection, ObjectMapper mapper) {
      return (workspaceId, payload) -> {
        try {
          projection.apply(mapper.readValue(payload, EventEnvelope.class));
        } catch (JsonProcessingException failure) {
          throw new IllegalArgumentException("event payload cannot be projected", failure);
        }
      };
    }
  }
}
