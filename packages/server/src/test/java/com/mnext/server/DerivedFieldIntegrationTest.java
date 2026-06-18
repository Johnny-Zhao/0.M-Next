package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
class DerivedFieldIntegrationTest {
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
  void reset() {
    jdbc.update("DELETE FROM derived_field");
    jdbc.update("DELETE FROM command_log");
  }

  @Test
  void defineDerivedFieldStoresDefinitionWithAuditAndIdempotency() {
    var request = define("total_load", "sum(traverse('carries','out'),'load')", "define-load");
    var response = post(request);

    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("ACCEPTED", response.getBody().get("status"));
    assertFalse((Boolean) response.getBody().get("idempotentReplay"));
    assertEquals(1, count("derived_field"));
    assertEquals(
        "number", value("SELECT result_type FROM derived_field WHERE code = 'total_load'"));
    assertEquals(
        "derived-user", value("SELECT created_by FROM derived_field WHERE code = 'total_load'"));

    var replay = post(request);
    assertEquals(200, replay.getStatusCode().value(), String.valueOf(replay.getBody()));
    assertTrue((Boolean) replay.getBody().get("idempotentReplay"));
    assertEquals(1, count("derived_field"));
  }

  @Test
  void defineDerivedFieldRejectsSyntaxErrorWithoutWrites() {
    var response = post(define("bad_expr", "field('name'", "define-bad-syntax"));

    assertEquals(400, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("DERIVE-400-SYNTAX-INVALID", errorCode(response));
    assertEquals(0, count("derived_field"));
    assertEquals(0, count("command_log"));
  }

  @Test
  void defineDerivedFieldRejectsDependencyCycle() {
    assertEquals(
        200, post(define("a_value", "field('b_value') + 1", "define-a")).getStatusCode().value());

    var response = post(define("b_value", "field('a_value') + 1", "define-b"));

    assertEquals(409, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("DERIVE-409-DEPENDENCY-CYCLE", errorCode(response));
    assertEquals(1, count("derived_field"));
  }

  @Test
  void defineDerivedFieldRejectsStoredFieldCodeConflict() {
    var response = post(define("name", "field('cost') + 1", "define-conflict"));

    assertEquals(422, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("KERNEL-422-FIELD-CONSTRAINT-INVALID", errorCode(response));
    assertEquals(0, count("derived_field"));
  }

  private Map<String, Object> define(String code, String derivation, String idempotencyKey) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeId", TYPE);
    payload.put("code", code);
    payload.put("name", code);
    payload.put("resultType", "number");
    payload.put("derivation", derivation);
    return command("DefineDerivedField", idempotencyKey, payload);
  }

  private Map<String, Object> command(
      String commandType, String idempotencyKey, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", WORKSPACE);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", idempotencyKey);
    request.put("commandType", commandType);
    request.put("payload", payload);
    return request;
  }

  private ResponseEntity<Map> post(Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "derived-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + WORKSPACE + "/meta-commands",
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private Object value(String sql) {
    return jdbc.queryForObject(sql, Object.class);
  }
}
