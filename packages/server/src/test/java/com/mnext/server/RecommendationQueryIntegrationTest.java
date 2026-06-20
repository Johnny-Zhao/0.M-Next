package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.events.EventEnvelope;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
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
    properties = {"mnext.outbox.enabled=false", "mnext.readmodel.enabled=false"})
class RecommendationQueryIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final AtomicInteger IDS = new AtomicInteger();

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
  @Autowired DerivedEvaluator derivedEvaluator;
  @LocalServerPort int port;

  @Test
  void recommendsTopCandidateByDerivedScoreAndReturnsAlternatives() throws Exception {
    var profile = instantiateRecommendationProfile("rank", false);
    var workspace = profile.workspace();
    var ids = runtimeIds(profile);
    var project = createObject(workspace, ids.projectType(), "create-project", Map.of("name", "P"));
    var low =
        createObject(
            workspace,
            ids.candidateType(),
            "create-low",
            Map.of("name", "low", "base_score", 50, "bonus", 5));
    var high =
        createObject(
            workspace,
            ids.candidateType(),
            "create-high",
            Map.of("name", "high", "base_score", 80, "bonus", 3));
    var middle =
        createObject(
            workspace,
            ids.candidateType(),
            "create-middle",
            Map.of("name", "middle", "base_score", 70, "bonus", 2));
    relate(workspace, ids.relationType(), project, low, "rel-low");
    relate(workspace, ids.relationType(), project, high, "rel-high");
    relate(workspace, ids.relationType(), project, middle, "rel-middle");
    projectOutbox();

    var view = recommendations(workspace, project, profile.relationCode(), "total_score", 10);

    var recommended = candidate(view, "recommended");
    var alternatives = candidates(view, "alternatives");
    assertCandidate(recommended, high, "high", 83, 1, true);
    assertCandidate(alternatives.get(0), middle, "middle", 72, 2, false);
    assertCandidate(alternatives.get(1), low, "low", 55, 3, false);
    assertDerivedScore(workspace, high, recommended);

    var topTwo = recommendations(workspace, project, profile.relationCode(), "total_score", 2);
    assertEquals(1, candidates(topTwo, "alternatives").size());

    var emptyProject =
        createObject(workspace, ids.projectType(), "create-empty-project", Map.of("name", "empty"));
    projectOutbox();
    var empty = recommendations(workspace, emptyProject, profile.relationCode(), "total_score", 10);
    assertNull(empty.get("recommended"));
    assertTrue(candidates(empty, "alternatives").isEmpty());
  }

  @Test
  void validatesRequiredParametersSizeAndCandidateLimit() throws Exception {
    var profile = instantiateRecommendationProfile("bounds", true);
    var workspace = profile.workspace();
    var ids = runtimeIds(profile);
    var project = createObject(workspace, ids.projectType(), "create-bound-project", Map.of());
    projectOutbox();

    assertEquals(
        400,
        status(
            workspace,
            "/views/recommendations?projectId="
                + project
                + "&relationTypeCode=&scoreField=total_score"));
    assertEquals(
        400,
        status(
            workspace,
            "/views/recommendations?projectId="
                + project
                + "&relationTypeCode="
                + profile.relationCode()
                + "&scoreField=total_score&size=201"));

    for (int index = 0; index < 501; index++) {
      var candidate = UUID.randomUUID();
      projection.apply(objectCreated(workspace, candidate, ids.candidateType()));
      projection.apply(relationCreated(workspace, ids.relationType(), project, candidate));
    }

    assertEquals(
        400,
        status(
            workspace,
            "/views/recommendations?projectId="
                + project
                + "&relationTypeCode="
                + profile.relationCode()
                + "&scoreField=total_score"));
  }

  private Profile instantiateRecommendationProfile(String suffix, boolean uniqueCodes) {
    var code = "rec_profile_" + suffix + "_" + UUID.randomUUID().toString().substring(0, 8);
    var objectSuffix = uniqueCodes ? "_" + suffix : "";
    var projectCode = "comparison_project" + objectSuffix;
    var candidateCode = "candidate" + objectSuffix;
    var relationCode = "project_has_candidate" + objectSuffix;
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
    defineField(AUTHOR, candidateType, "base_score", "number", "base-score-" + suffix);
    defineField(AUTHOR, candidateType, "bonus", "number", "bonus-" + suffix);
    meta(
        AUTHOR,
        "DefineRelationType",
        "relation-" + suffix,
        Map.of(
            "templateVersionId",
            version,
            "code",
            relationCode,
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
    meta(
        AUTHOR,
        "DefineDerivedField",
        "total-score-" + suffix,
        Map.of(
            "templateVersionId",
            version,
            "objectTypeId",
            candidateType,
            "code",
            "total_score",
            "name",
            "Total Score",
            "resultType",
            "number",
            "derivation",
            "field('base_score') + field('bonus')"));
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
            "Recommendations"));
    return new Profile(workspace, projectCode, candidateCode, relationCode);
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

  private void projectOutbox() throws Exception {
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
      projection.apply(mapper.readValue(payload, EventEnvelope.class));
    }
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

  @SuppressWarnings("unchecked")
  private Map<String, Object> recommendations(
      UUID workspace, UUID project, String relationType, String scoreField, int size) {
    var response =
        http.getForEntity(
            base(workspace)
                + "/views/recommendations?projectId="
                + project
                + "&relationTypeCode="
                + relationType
                + "&scoreField="
                + scoreField
                + "&order=desc&size="
                + size,
            Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private int status(UUID workspace, String path) {
    return http.getForEntity(base(workspace) + path, Map.class).getStatusCode().value();
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> candidate(Map<String, Object> view, String key) {
    return (Map<String, Object>) view.get(key);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> candidates(Map<String, Object> view, String key) {
    return (List<Map<String, Object>>) view.get(key);
  }

  private void assertCandidate(
      Map<String, Object> candidate,
      UUID objectId,
      String name,
      int score,
      int rank,
      boolean recommended) {
    assertEquals(objectId.toString(), candidate.get("candidateId"));
    assertEquals(score, new BigDecimal(candidate.get("score").toString()).intValueExact());
    assertEquals(rank, ((Number) candidate.get("rank")).intValue());
    assertEquals(recommended, candidate.get("recommended"));
    assertEquals(name, ((Map<?, ?>) candidate.get("fields")).get("name"));
  }

  private void assertDerivedScore(UUID workspace, UUID objectId, Map<String, Object> candidate) {
    var expected = (BigDecimal) derivedEvaluator.evaluate(workspace, objectId, "total_score");
    var actual = new BigDecimal(candidate.get("score").toString());
    assertEquals(0, expected.compareTo(actual));
  }

  private EventEnvelope objectCreated(UUID workspace, UUID objectId, UUID objectType) {
    return event(
        workspace,
        "ObjectCreated",
        "object",
        objectId.toString(),
        Map.of("objectId", objectId, "objectTypeId", objectType, "status", "DRAFT"));
  }

  private EventEnvelope relationCreated(
      UUID workspace, UUID relationType, UUID source, UUID target) {
    var relation = UUID.randomUUID();
    return event(
        workspace,
        "RelationCreated",
        "relation",
        relation.toString(),
        Map.of(
            "relationTypeId",
            relationType,
            "sourceId",
            source,
            "targetId",
            target,
            "fields",
            Map.of()));
  }

  private EventEnvelope event(
      UUID workspace,
      String eventType,
      String targetType,
      String targetId,
      Map<String, Object> after) {
    return new EventEnvelope(
        eventId(),
        eventType,
        1,
        workspace,
        targetType,
        targetId,
        1,
        null,
        after,
        Actor.user("recommendation-user"),
        "manual",
        Instant.now(),
        UUID.randomUUID(),
        "recommendation-test",
        1,
        Map.of());
  }

  private String eventId() {
    return "01ARZ3NDEKTSV4RRFFQ70" + String.format("%05d", IDS.incrementAndGet());
  }

  private String base(UUID workspace) {
    return "http://localhost:" + port + "/workspaces/" + workspace;
  }

  private record Profile(
      UUID workspace, String projectCode, String candidateCode, String relationCode) {}

  private record RuntimeIds(UUID projectType, UUID candidateType, UUID relationType) {}
}
