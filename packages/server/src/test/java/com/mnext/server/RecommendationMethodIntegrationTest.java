package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "mnext.outbox.enabled=false",
      "mnext.readmodel.enabled=false",
      "mnext.sim.async.enabled=false"
    })
class RecommendationMethodIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");

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
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;
  @Autowired ReadModelProjection projection;
  @Autowired ReadModelRepository readModel;
  @Autowired SimulationRunner runner;
  @LocalServerPort int port;

  @Test
  void routesRecommendationByMethodAndFiltersTopsisRunRanking() throws Exception {
    var profile = instantiateProfile("method");
    var ids = runtimeIds(profile);
    var workspace = profile.workspace();
    var project = createObject(workspace, ids.projectType(), "project", Map.of("name", "P"));
    var alpha = candidate(workspace, ids.candidateType(), "alpha", 100, 80);
    var beta = candidate(workspace, ids.candidateType(), "beta", 120, 90);
    var gamma = candidate(workspace, ids.candidateType(), "gamma", 90, 70);
    var outside = candidate(workspace, ids.candidateType(), "outside", 50, 100);
    relate(workspace, ids.relationType(), project, alpha, "rel-alpha");
    relate(workspace, ids.relationType(), project, beta, "rel-beta");
    relate(workspace, ids.relationType(), project, gamma, "rel-gamma");
    projectOutbox();

    var snapshot = captureSnapshot(workspace);
    var run = runTopsis(workspace, snapshot, profile.candidateCode());
    var expected = projectRanking(run, List.of(alpha, beta, gamma));
    var view = recommendations(workspace, project, profile.relationCode(), "topsis", null, 10);

    assertRanking(view, expected);
    assertFalse(candidateIds(view).contains(outside.toString()));
    assertNoRunAndValidation(profile);

    var weighted =
        recommendations(
            workspace, project, profile.relationCode(), "weighted", "weighted_score", 10);
    assertEquals(beta.toString(), candidate(weighted, "recommended").get("candidateId"));

    var lateProject =
        createObject(workspace, ids.projectType(), "late-project", Map.of("name", "late"));
    var late = candidate(workspace, ids.candidateType(), "late", 10, 10);
    relate(workspace, ids.relationType(), lateProject, late, "rel-late");
    projectOutbox();
    var empty = recommendations(workspace, lateProject, profile.relationCode(), "topsis", null, 10);
    assertNull(empty.get("recommended"));
    assertTrue(candidates(empty, "alternatives").isEmpty());
  }

  private void assertNoRunAndValidation(Profile profile) {
    var other = instantiateProfile("no_run");
    var ids = runtimeIds(other);
    var project = createObject(other.workspace(), ids.projectType(), "no-run-project", Map.of());
    projectOutbox();
    assertEquals(
        409,
        status(
            other.workspace(),
            recommendationsPath(project, other.relationCode(), "topsis", null, 10)));
    assertEquals(
        400,
        status(
            profile.workspace(),
            recommendationsPath(project, profile.relationCode(), "foo", null, 10)));
    assertEquals(
        400,
        status(
            profile.workspace(),
            recommendationsPath(project, profile.relationCode(), "weighted", null, 10)));
  }

  private Profile instantiateProfile(String suffix) {
    var code = "rec_method_" + suffix + "_" + UUID.randomUUID().toString().substring(0, 8);
    var projectCode = "comparison_project_" + suffix;
    var candidateCode = "candidate_" + suffix;
    var relationCode = "project_has_candidate_" + suffix;
    var template =
        metaValue(
            meta(
                AUTHOR, "CreateTemplate", "template-" + suffix, Map.of("code", code, "name", code)),
            "templateId");
    var version =
        metaValue(
            meta(
                AUTHOR,
                "CreateTemplateVersion",
                "version-" + suffix,
                Map.of("templateId", template)),
            "templateVersionId");
    var projectType =
        metaValue(
            meta(
                AUTHOR,
                "DefineObjectType",
                "project-type-" + suffix,
                Map.of("templateVersionId", version, "code", projectCode, "name", "Project")),
            "objectTypeId");
    var candidateType =
        metaValue(
            meta(
                AUTHOR,
                "DefineObjectType",
                "candidate-type-" + suffix,
                Map.of("templateVersionId", version, "code", candidateCode, "name", "Candidate")),
            "objectTypeId");
    defineField(AUTHOR, projectType, "name", "string", "project-name-" + suffix);
    defineField(AUTHOR, candidateType, "name", "string", "candidate-name-" + suffix);
    defineField(AUTHOR, candidateType, "price", "number", "price-" + suffix);
    defineField(AUTHOR, candidateType, "quality", "number", "quality-" + suffix);
    defineRelation(version, projectType, candidateType, relationCode, suffix);
    defineWeightedScore(version, candidateType, suffix);
    meta(
        AUTHOR,
        "PublishTemplateVersion",
        "publish-" + suffix,
        Map.of("templateVersionId", version));
    var workspace = UUID.randomUUID();
    meta(
        AUTHOR,
        "InstantiateWorkspace",
        "instantiate-" + suffix,
        Map.of(
            "templateId",
            template,
            "version",
            2,
            "newWorkspaceId",
            workspace,
            "workspaceName",
            "Recommendation Method"));
    return new Profile(workspace, projectCode, candidateCode, relationCode);
  }

  private void defineRelation(
      UUID version, UUID projectType, UUID candidateType, String code, String suffix) {
    meta(
        AUTHOR,
        "DefineRelationType",
        "relation-" + suffix,
        Map.of(
            "templateVersionId",
            version,
            "code",
            code,
            "name",
            "Project Has Candidate",
            "sourceTypeId",
            projectType,
            "targetTypeId",
            candidateType,
            "direction",
            "directed",
            "cardinality",
            "one_to_many",
            "semantics",
            "weak",
            "hierarchical",
            false));
  }

  private void defineWeightedScore(UUID version, UUID candidateType, String suffix) {
    meta(
        AUTHOR,
        "DefineDerivedField",
        "weighted-score-" + suffix,
        Map.of(
            "templateVersionId",
            version,
            "objectTypeId",
            candidateType,
            "code",
            "weighted_score",
            "name",
            "Weighted Score",
            "resultType",
            "number",
            "derivation",
            "field('quality')"));
  }

  private RuntimeIds runtimeIds(Profile profile) {
    var types = objectTypes(profile.workspace());
    return new RuntimeIds(
        objectTypeId(types, profile.projectCode()),
        objectTypeId(types, profile.candidateCode()),
        readModel.relationTypeId(profile.workspace(), profile.relationCode()));
  }

  private void defineField(
      UUID workspace, UUID objectType, String code, String dataType, String key) {
    meta(
        workspace,
        "DefineFieldDef",
        key,
        Map.of(
            "objectTypeId",
            objectType,
            "code",
            code,
            "name",
            code,
            "dataType",
            dataType,
            "required",
            false));
  }

  private UUID candidate(UUID workspace, UUID objectType, String name, int price, int quality) {
    return createObject(
        workspace,
        objectType,
        "candidate-" + name,
        Map.of("name", name, "price", price, "quality", quality));
  }

  private UUID createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    var response =
        command(
            workspace,
            "CreateObject",
            key,
            Map.of(
                "objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
    return createdObjectId(response);
  }

  private void relate(UUID workspace, UUID relationType, UUID source, UUID target, String key) {
    command(
        workspace,
        "CreateRelation",
        key,
        Map.of(
            "relationTypeId",
            relationType,
            "sourceId",
            source,
            "targetId",
            target,
            "relationFields",
            Map.of(),
            "source",
            Map.of("type", "manual")));
  }

  private UUID captureSnapshot(UUID workspace) {
    var response = post(workspace, "/snapshots", Map.of());
    return UUID.fromString(response.getBody().get("snapshotId").toString());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> runTopsis(UUID workspace, UUID snapshot, String candidateTypeCode) {
    var response =
        post(
            workspace,
            "/simulations",
            Map.of(
                "snapshotId",
                snapshot,
                "engineId",
                "decision-topsis",
                "config",
                Map.of("candidateTypeCode", candidateTypeCode, "criteria", criteria())));
    var runId = UUID.fromString(response.getBody().get("runId").toString());
    assertEquals(1, runner.drain());
    var completed =
        http.getForEntity(base(workspace) + "/simulations/" + runId, Map.class).getBody();
    assertEquals("COMPLETED", completed.get("status"));
    return (Map<String, Object>) completed.get("result");
  }

  private List<Map<String, Object>> criteria() {
    return List.of(
        Map.of("field", "price", "weight", 0.5d, "direction", "cost"),
        Map.of("field", "quality", "weight", 0.5d, "direction", "benefit"));
  }

  private ResponseEntity<Map> meta(
      UUID workspace, String commandType, String key, Map<String, Object> payload) {
    return post(workspace, "/meta-commands", envelope(commandType, workspace, key, payload));
  }

  private Map command(UUID workspace, String commandType, String key, Map<String, Object> payload) {
    return post(workspace, "/commands", envelope(commandType, workspace, key, payload)).getBody();
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "recommendation-user");
    var response =
        http.postForEntity(base(workspace) + path, new HttpEntity<>(request, headers), Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response;
  }

  private Map<String, Object> envelope(
      String commandType, UUID workspace, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("commandType", commandType);
    request.put("workspaceId", workspace);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", key);
    request.put("payload", payload);
    return request;
  }

  private UUID metaValue(ResponseEntity<Map> response, String name) {
    return value(response.getBody(), name);
  }

  @SuppressWarnings("unchecked")
  private UUID createdObjectId(Map body) {
    return ((List<String>) body.get("events"))
        .stream()
            .map(event -> outboxAfter(event, "objectId"))
            .filter(value -> value != null)
            .map(UUID::fromString)
            .findFirst()
            .orElseThrow();
  }

  private UUID value(Map body, String name) {
    return ((List<?>) body.get("events"))
        .stream()
            .map(Object::toString)
            .filter(event -> event.startsWith(name + "="))
            .map(event -> UUID.fromString(event.substring(name.length() + 1)))
            .findFirst()
            .orElseThrow();
  }

  private String outboxAfter(String eventId, String field) {
    return jdbc.query(
        "SELECT payload->'after'->>? FROM event_outbox WHERE id = ?",
        result -> result.next() ? result.getString(1) : null,
        field,
        eventId);
  }

  private void projectOutbox() {
    var events =
        jdbc.queryForList(
            """
            SELECT payload::text FROM event_outbox
            ORDER BY CASE event_type
                WHEN 'ObjectCreated' THEN 1
                WHEN 'FieldChanged' THEN 2
                WHEN 'RelationCreated' THEN 3
                ELSE 9
              END,
              created_at,
              aggregate_id,
              sequence
            """,
            String.class);
    for (var payload : events) {
      try {
        projection.apply(mapper.readValue(payload, EventEnvelope.class));
      } catch (Exception failure) {
        throw new IllegalStateException(failure);
      }
    }
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> projectRanking(Map<String, Object> result, List<UUID> ids) {
    var allowed = ids.stream().map(UUID::toString).toList();
    return ((List<Map<String, Object>>) result.get("ranking"))
        .stream().filter(item -> allowed.contains(item.get("candidateId").toString())).toList();
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> recommendations(
      UUID workspace,
      UUID project,
      String relationType,
      String method,
      String scoreField,
      int size) {
    var response =
        http.getForEntity(
            base(workspace) + recommendationsPath(project, relationType, method, scoreField, size),
            Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private String recommendationsPath(
      UUID project, String relationType, String method, String scoreField, int size) {
    var path =
        "/views/recommendations?projectId="
            + project
            + "&relationTypeCode="
            + relationType
            + "&method="
            + method
            + "&size="
            + size;
    return scoreField == null ? path : path + "&scoreField=" + scoreField;
  }

  private void assertRanking(Map<String, Object> view, List<Map<String, Object>> expected) {
    var actual = allCandidates(view);
    assertEquals(expected.size(), actual.size());
    for (var index = 0; index < expected.size(); index++) {
      var item = actual.get(index);
      var source = expected.get(index);
      assertEquals(source.get("candidateId").toString(), item.get("candidateId"));
      assertEquals(index + 1, ((Number) item.get("rank")).intValue());
      assertEquals(index == 0, item.get("recommended"));
      assertEquals(
          0,
          new BigDecimal(source.get("closeness").toString())
              .compareTo(new BigDecimal(item.get("score").toString())));
    }
  }

  private List<String> candidateIds(Map<String, Object> view) {
    return allCandidates(view).stream().map(item -> item.get("candidateId").toString()).toList();
  }

  private List<Map<String, Object>> allCandidates(Map<String, Object> view) {
    var result = new java.util.ArrayList<Map<String, Object>>();
    var recommended = candidate(view, "recommended");
    if (recommended != null) result.add(recommended);
    result.addAll(candidates(view, "alternatives"));
    return result;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> candidate(Map<String, Object> view, String key) {
    return (Map<String, Object>) view.get(key);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> candidates(Map<String, Object> view, String key) {
    return (List<Map<String, Object>>) view.get(key);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> objectTypes(UUID workspace) {
    var response = http.getForEntity(base(workspace) + "/views/object-types", List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private UUID objectTypeId(List<Map<String, Object>> types, String code) {
    return types.stream()
        .filter(type -> code.equals(type.get("code")))
        .map(type -> UUID.fromString(type.get("id").toString()))
        .findFirst()
        .orElseThrow();
  }

  private int status(UUID workspace, String path) {
    return http.getForEntity(base(workspace) + path, Map.class).getStatusCode().value();
  }

  private String base(UUID workspace) {
    return "http://localhost:" + port + "/workspaces/" + workspace;
  }

  private record Profile(
      UUID workspace, String projectCode, String candidateCode, String relationCode) {}

  private record RuntimeIds(UUID projectType, UUID candidateType, UUID relationType) {}
}
