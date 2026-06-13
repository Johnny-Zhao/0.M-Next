package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReviewIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID TYPE = UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final UUID FIELD = UUID.fromString("33333333-3333-4333-8333-333333333332");
  private static final UUID RELATION_TYPE = UUID.fromString("44444444-4444-4444-8444-444444444441");
  private static final UUID OBJECT = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  private static final UUID OTHER = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  private static final UUID RELATION = UUID.fromString("cccccccc-cccc-4ccc-8ccc-cccccccccccc");

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
  @LocalServerPort int port;

  @BeforeEach
  void seedTargets() {
    jdbc.update("DELETE FROM annotation");
    jdbc.update("DELETE FROM review_round");
    jdbc.update("DELETE FROM relation_history");
    jdbc.update("DELETE FROM data_relation");
    jdbc.update("DELETE FROM field_value_history");
    jdbc.update("DELETE FROM data_field_value");
    jdbc.update("DELETE FROM data_object");
    insertObject(OBJECT, 7);
    insertObject(OTHER, 3);
    jdbc.update(
        """
        INSERT INTO data_field_value
          (object_id, field_def_id, value, version, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, '10'::jsonb, 4, 'seed', 'seed', now(), now())
        """,
        OBJECT,
        FIELD);
    insertRelation();
  }

  @Test
  void createsQueriesAndChangesStateWithoutChangingMasterDataVersions() {
    var field = create("field", OBJECT, "cost", 4, "issue");
    create("object", OBJECT, null, 7, "suggest");
    create("relation", RELATION, null, 6, "block");
    var versions = versions();

    var found =
        http.getForEntity(
            base() + "/annotations?targetType=field&targetId=" + OBJECT + "&fieldCode=cost",
            Map[].class);
    var resolved = state("ResolveAnnotation", field.get("id").toString());
    var reopened = state("ReopenAnnotation", field.get("id").toString());

    assertEquals(200, found.getStatusCode().value());
    assertEquals(1, found.getBody().length);
    assertEquals(4, found.getBody()[0].get("anchoredDataVersion"));
    assertEquals(3, count("annotation"));
    assertEquals("test-user", resolved.getBody().get("resolvedBy"));
    assertEquals("open", reopened.getBody().get("status"));
    assertNull(reopened.getBody().get("resolvedBy"));
    assertEquals(versions, versions());
  }

  @Test
  void rejectsInvalidAnchorsAndMissingTargets() {
    assertError(
        createResponse("field", OBJECT, null, 4, "issue"), 422, "REVIEW-422-FIELD-CODE-REQUIRED");
    assertError(
        createResponse("object", OBJECT, "cost", 7, "issue"), 400, "REVIEW-400-SCHEMA-INVALID");
    assertError(
        createResponse("relation", UUID.randomUUID(), null, 1, "issue"),
        404,
        "REVIEW-404-TARGET-NOT-FOUND");
  }

  @Test
  void rejectsInvalidStateTransitions() {
    var annotation = create("object", OBJECT, null, 7, "info");
    var id = annotation.get("id").toString();

    assertError(state("ReopenAnnotation", id), 409, "REVIEW-409-INVALID-STATE-TRANSITION");
    assertEquals(200, state("ResolveAnnotation", id).getStatusCode().value());
    assertError(state("ResolveAnnotation", id), 409, "REVIEW-409-INVALID-STATE-TRANSITION");
  }

  private void insertObject(UUID id, long version) {
    jdbc.update(
        """
        INSERT INTO data_object
          (id, workspace_id, object_type_id, status, version,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, 'DRAFT', ?, 'seed', 'seed', now(), now())
        """,
        id,
        WORKSPACE,
        TYPE,
        version);
  }

  private void insertRelation() {
    jdbc.update(
        """
        INSERT INTO data_relation
          (id, workspace_id, relation_type_id, source_id, target_id, fields, status, version,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '{}'::jsonb, 'ACTIVE', 6, 'seed', 'seed', now(), now())
        """,
        RELATION,
        WORKSPACE,
        RELATION_TYPE,
        OBJECT,
        OTHER);
  }

  private Map<String, Object> create(
      String targetType, UUID targetId, String fieldCode, long version, String severity) {
    var response = createResponse(targetType, targetId, fieldCode, version, severity);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private ResponseEntity<Map> createResponse(
      String targetType, UUID targetId, String fieldCode, long version, String severity) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("targetType", targetType);
    payload.put("targetId", targetId.toString());
    if (fieldCode != null) payload.put("fieldCode", fieldCode);
    payload.put("anchoredDataVersion", version);
    payload.put("severity", severity);
    payload.put("body", "review body");
    return post(envelope("CreateAnnotation", payload));
  }

  private ResponseEntity<Map> state(String commandType, String annotationId) {
    return post(envelope(commandType, Map.of("annotationId", annotationId)));
  }

  private Map<String, Long> versions() {
    return Map.of(
        "object",
            jdbc.queryForObject("SELECT version FROM data_object WHERE id = ?", Long.class, OBJECT),
        "field",
            jdbc.queryForObject(
                "SELECT version FROM data_field_value WHERE object_id = ?", Long.class, OBJECT),
        "relation",
            jdbc.queryForObject(
                "SELECT version FROM data_relation WHERE id = ?", Long.class, RELATION));
  }

  private Map<String, Object> envelope(String commandType, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("commandType", commandType);
    request.put("workspaceId", WORKSPACE.toString());
    request.put("correlationId", UUID.randomUUID().toString());
    request.put("idempotencyKey", UUID.randomUUID().toString());
    request.put("payload", payload);
    return request;
  }

  private ResponseEntity<Map> post(Map<String, Object> request) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", "test-user");
    return http.postForEntity(
        base() + "/review/commands", new HttpEntity<>(request, headers), Map.class);
  }

  private void assertError(ResponseEntity<Map> response, int status, String code) {
    assertEquals(status, response.getStatusCode().value());
    assertEquals(code, ((Map<?, ?>) response.getBody().get("error")).get("code"));
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private String base() {
    return "http://localhost:" + port + "/workspaces/" + WORKSPACE;
  }
}
