package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
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
class CommandIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID TYPE = UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final UUID DEPENDS = UUID.fromString("44444444-4444-4444-8444-444444444441");

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
  void cleanCommands() {
    jdbc.update("DELETE FROM relation_closure");
    jdbc.update("DELETE FROM relation_history");
    jdbc.update("DELETE FROM data_relation");
    jdbc.update("DELETE FROM event_outbox");
    jdbc.update("DELETE FROM command_log");
    jdbc.update("DELETE FROM field_value_history");
    jdbc.update("DELETE FROM data_field_value");
    jdbc.update("DELETE FROM data_object");
  }

  @Test
  void scenarioOneRejectsConcurrentSameField() {
    var objectId = createObject("scenario-one", Map.of("name", "demo", "cost", 10));

    var first = update("same-field-a", objectId, 1, "cost", 11, 1L);
    var second = update("same-field-b", objectId, 1, "cost", 12, 1L);

    assertEquals(200, first.getStatusCode().value());
    assertEquals(409, second.getStatusCode().value());
    var details = error(second).get("details");
    assertTrue(details instanceof Map<?, ?>);
    assertFalse(((List<?>) ((Map<?, ?>) details).get("conflictingFields")).isEmpty());
  }

  @Test
  void scenarioTwoMergesConcurrentDifferentFields() {
    var objectId =
        createObject("scenario-two", Map.of("name", "demo", "cost", 10, "owner", "alice"));

    var cost = update("different-cost", objectId, 1, "cost", 11, 1L);
    var owner = update("different-owner", objectId, 1, "owner", "bob", 1L);

    assertEquals(200, cost.getStatusCode().value());
    assertEquals(200, owner.getStatusCode().value());
    assertEquals(
        3L,
        jdbc.queryForObject("SELECT version FROM data_object WHERE id = ?", Long.class, objectId));
  }

  @Test
  void scenarioElevenRejectsIdempotencyKeyWithDifferentPayload() {
    var first = post(createRequest("same-key", Map.of("name", "first")));
    var second = post(createRequest("same-key", Map.of("name", "second")));

    assertEquals(200, first.getStatusCode().value());
    assertEquals(409, second.getStatusCode().value());
    assertEquals("KERNEL-409-IDEMPOTENCY-CONFLICT", error(second).get("code"));
    assertNotNull(((Map<?, ?>) error(second).get("details")).get("commandId"));
    assertEquals(1, count("data_object"));
  }

  @Test
  void failedRequiredValidationLeavesNoWrites() {
    var response = post(createRequest("missing-required", Map.of("cost", 10)));

    assertEquals(422, response.getStatusCode().value());
    assertEquals(0, count("data_object"));
    assertEquals(0, count("command_log"));
    assertEquals(0, count("event_outbox"));
  }

  @Test
  void idempotentReplayHasZeroSideEffects() {
    var request = createRequest("replay-key", Map.of("name", "demo", "cost", 10));

    var first = post(request);
    var initialEvents = count("event_outbox");
    var replay = post(request);

    assertEquals(200, first.getStatusCode().value());
    assertEquals(200, replay.getStatusCode().value());
    assertEquals(Boolean.TRUE, replay.getBody().get("idempotentReplay"));
    assertEquals(initialEvents, count("event_outbox"));
    assertEquals(1, count("command_log"));
  }

  @Test
  void rejectsUnknownCommandWithRegisteredCode() {
    var response = post(envelope("ConfirmAIChangeSet", "unknown-command", Map.of()));

    assertEquals(400, response.getStatusCode().value());
    assertEquals("KERNEL-400-UNKNOWN-COMMAND", error(response).get("code"));
  }

  @Test
  void relationCommandsCompleteHttpVerticalSlice() {
    var source = createObject("relation-source", Map.of("name", "source"));
    var target = createObject("relation-target", Map.of("name", "target"));

    var created = post(relationRequest("relation-create", source, target));
    var relationId = jdbc.queryForObject("SELECT id FROM data_relation", UUID.class);
    var updated = post(updateRelationRequest("relation-update", relationId, Map.of("weight", 2)));
    var unlinked = post(unlinkRequest("relation-unlink", relationId, 2));

    assertEquals(200, created.getStatusCode().value());
    assertEquals(200, updated.getStatusCode().value());
    assertEquals(200, unlinked.getStatusCode().value());
    assertEquals(
        "UNLINKED",
        jdbc.queryForObject(
            "SELECT status FROM data_relation WHERE id = ?", String.class, relationId));
  }

  @Test
  void stateArchiveSoftDeleteAndBatchCompleteHttpVerticalSlice() {
    var stateTarget = createObject("state-http", Map.of("name", "state"));
    var changed = post(changeStateRequest("state-change", stateTarget));
    var archived = post(archiveRequest("archive-http", stateTarget, 2));
    var deleteTarget = createObject("delete-http", Map.of("name", "delete"));
    var deleted = post(softDeleteRequest("soft-delete-http", deleteTarget));
    var batch = post(batchRequest("batch-http"));

    assertEquals(200, changed.getStatusCode().value());
    assertEquals(200, archived.getStatusCode().value());
    assertEquals(200, deleted.getStatusCode().value());
    assertEquals(200, batch.getStatusCode().value());
    assertEquals("VOID", status(stateTarget));
    assertEquals("DELETED", status(deleteTarget));
    assertEquals(2, ((List<?>) batch.getBody().get("results")).size());
  }

  private UUID createObject(String key, Map<String, Object> fields) {
    var response = post(createRequest(key, fields));
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertTrue(count("data_field_value") > 0);
    assertTrue(count("field_value_history") > 0);
    assertTrue(count("command_log") > 0);
    assertTrue(count("event_outbox") > 0);
    return jdbc.queryForObject(
        "SELECT id FROM data_object ORDER BY created_at DESC LIMIT 1", UUID.class);
  }

  private Map<String, Object> createRequest(String key, Map<String, Object> fields) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeId", TYPE.toString());
    payload.put("fields", fields);
    payload.put("source", Map.of("type", "manual"));
    return envelope("CreateObject", key, payload);
  }

  private ResponseEntity<Map> update(
      String key, UUID objectId, long objectVersion, String code, Object value, Long fieldVersion) {
    var field = new LinkedHashMap<String, Object>();
    field.put("fieldDefCode", code);
    field.put("value", value);
    if (fieldVersion != null) field.put("expectedFieldVersion", fieldVersion);
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectId", objectId.toString());
    payload.put("expectedObjectVersion", objectVersion);
    payload.put("fields", List.of(field));
    return post(envelope("UpdateFields", key, payload));
  }

  private Map<String, Object> relationRequest(String key, UUID source, UUID target) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("relationTypeId", DEPENDS.toString());
    payload.put("sourceId", source.toString());
    payload.put("targetId", target.toString());
    payload.put("relationFields", Map.of("weight", 1));
    payload.put("source", Map.of("type", "manual"));
    return envelope("CreateRelation", key, payload);
  }

  private Map<String, Object> updateRelationRequest(
      String key, UUID relationId, Map<String, Object> fields) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("relationId", relationId.toString());
    payload.put("expectedVersion", 1);
    payload.put("fields", fields);
    return envelope("UpdateRelation", key, payload);
  }

  private Map<String, Object> unlinkRequest(String key, UUID relationId, long version) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("relationId", relationId.toString());
    payload.put("reason", "obsolete");
    payload.put("expectedVersion", version);
    return envelope("Unlink", key, payload);
  }

  private Map<String, Object> changeStateRequest(String key, UUID targetId) {
    return envelope(
        "ChangeState",
        key,
        Map.of(
            "targetType", "object",
            "targetId", targetId.toString(),
            "fromState", "DRAFT",
            "toState", "PENDING_CONFIRM",
            "reason", "review",
            "expectedVersion", 1));
  }

  private Map<String, Object> archiveRequest(String key, UUID targetId, long version) {
    return envelope(
        "Archive",
        key,
        Map.of(
            "targetType", "object",
            "targetId", targetId.toString(),
            "reason", "obsolete",
            "expectedVersion", version,
            "relationPolicy", "reject"));
  }

  private Map<String, Object> softDeleteRequest(String key, UUID targetId) {
    return envelope(
        "SoftDelete",
        key,
        Map.of(
            "targetType", "object",
            "targetId", targetId.toString(),
            "reason", "draft cleanup",
            "expectedVersion", 1,
            "relationPolicy", "reject"));
  }

  private Map<String, Object> batchRequest(String key) {
    var first = createRequest(key + "-ignored-a", Map.of("name", "batch-a"));
    var second = createRequest(key + "-ignored-b", Map.of("name", "batch-b"));
    var children =
        List.of(
            Map.of("commandType", "CreateObject", "payload", first.get("payload")),
            Map.of("commandType", "CreateObject", "payload", second.get("payload")));
    return envelope(
        "BatchCommand", key, Map.of("commands", children, "transactionMode", "partial"));
  }

  private String status(UUID objectId) {
    return jdbc.queryForObject(
        "SELECT status FROM data_object WHERE id = ?", String.class, objectId);
  }

  private Map<String, Object> envelope(
      String commandType, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("commandType", commandType);
    request.put("workspaceId", WORKSPACE.toString());
    request.put("correlationId", UUID.randomUUID().toString());
    request.put("idempotencyKey", key);
    request.put("payload", payload);
    return request;
  }

  private ResponseEntity<Map> post(Map<String, Object> request) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", "test-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + WORKSPACE + "/commands",
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private Map<?, ?> error(ResponseEntity<Map> response) {
    return (Map<?, ?>) response.getBody().get("error");
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }
}
