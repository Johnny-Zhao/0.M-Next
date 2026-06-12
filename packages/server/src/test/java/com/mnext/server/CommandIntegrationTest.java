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
    var response = post(envelope("Archive", "unknown-command", Map.of()));

    assertEquals(400, response.getStatusCode().value());
    assertEquals("KERNEL-400-UNKNOWN-COMMAND", error(response).get("code"));
  }

  private UUID createObject(String key, Map<String, Object> fields) {
    var response = post(createRequest(key, fields));
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertTrue(count("data_field_value") > 0);
    assertTrue(count("field_value_history") > 0);
    assertTrue(count("command_log") > 0);
    assertTrue(count("event_outbox") > 0);
    return jdbc.queryForObject("SELECT id FROM data_object", UUID.class);
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
