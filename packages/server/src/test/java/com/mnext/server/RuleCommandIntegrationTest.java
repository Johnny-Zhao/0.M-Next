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
class RuleCommandIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID OTHER_TYPE = UUID.fromString("aaaaaaaa-1111-4111-8111-111111111111");
  private static final UUID OTHER_FIELD = UUID.fromString("aaaaaaaa-2222-4222-8222-222222222222");
  private static final UUID TYPE = UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final UUID CHILD_TYPE = UUID.fromString("bbbbbbbb-1111-4111-8111-111111111111");

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
    jdbc.update("DELETE FROM event_outbox");
    jdbc.update("DELETE FROM field_value_history");
    jdbc.update("DELETE FROM data_field_value");
    jdbc.update("DELETE FROM data_object");
    jdbc.update("DELETE FROM rule_def");
    jdbc.update("DELETE FROM command_log");
    jdbc.update("DELETE FROM field_def WHERE id = ?", OTHER_FIELD);
    jdbc.update("DELETE FROM object_type WHERE id = ?", CHILD_TYPE);
    jdbc.update("DELETE FROM object_type WHERE id = ?", OTHER_TYPE);
  }

  @Test
  void defineRuleStoresDraftWithAuditAndIdempotency() {
    var request = define("required-name", "field('name') == null", "name", "define-ok");
    var response = post(request);

    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("ACCEPTED", response.getBody().get("status"));
    assertFalse((Boolean) response.getBody().get("idempotentReplay"));
    assertEquals(1, count("rule_def"));
    assertEquals(
        "rule-user", value("SELECT created_by FROM rule_def WHERE rule_code = 'required-name'"));
    assertEquals(
        "rule-user", value("SELECT updated_by FROM rule_def WHERE rule_code = 'required-name'"));
    assertEquals(1, count("command_log"));

    var replay = post(request);
    assertEquals(200, replay.getStatusCode().value(), String.valueOf(replay.getBody()));
    assertTrue((Boolean) replay.getBody().get("idempotentReplay"));
    assertEquals(1, count("rule_def"));
  }

  @Test
  void defineRuleRejectsSyntaxError() {
    var response = post(define("bad-dsl", "field('name' == null", "name", "syntax"));

    assertEquals(400, response.getStatusCode().value());
    assertEquals("RULE-400-DSL-SYNTAX-INVALID", errorCode(response));
    assertEquals(0, count("rule_def"));
    assertEquals(0, count("command_log"));
  }

  @Test
  void defineRuleRejectsMissingScopeType() {
    var response = post(defineWithScope("missing-scope", "missing_type", null, "scope-missing"));

    assertEquals(422, response.getStatusCode().value());
    assertEquals("RULE-422-SCOPE-UNRESOLVED", errorCode(response));
    assertEquals(0, count("rule_def"));
  }

  @Test
  void defineRuleRejectsFieldCodeOutsideType() {
    insertOtherTypeAndField();

    var response = post(defineWithScope("bad-field", "demo_object", "foreign", "bad-field"));

    assertEquals(422, response.getStatusCode().value());
    assertEquals("RULE-422-SCOPE-UNRESOLVED", errorCode(response));
    assertEquals(0, count("rule_def"));
  }

  @Test
  void publishRuleLocksVersionAndAllowsIdempotentReplay() {
    assertEquals(
        200,
        post(define("publish-me", "field('name') == null", "name", "define-pub"))
            .getStatusCode()
            .value());

    var request = publish("publish-me", "publish-key");
    var published = post(request);
    var replay = post(request);

    assertEquals(200, published.getStatusCode().value(), String.valueOf(published.getBody()));
    assertEquals(200, replay.getStatusCode().value(), String.valueOf(replay.getBody()));
    assertTrue((Boolean) replay.getBody().get("idempotentReplay"));
    assertEquals(
        Boolean.TRUE, value("SELECT published FROM rule_def WHERE rule_code = 'publish-me'"));
    assertEquals(2L, value("SELECT version FROM rule_def WHERE rule_code = 'publish-me'"));
    assertEquals(
        "rule-user", value("SELECT updated_by FROM rule_def WHERE rule_code = 'publish-me'"));
  }

  @Test
  void defineRuleRejectsPublishedRule() {
    assertEquals(
        200,
        post(define("locked-rule", "field('name') == null", "name", "define-lock"))
            .getStatusCode()
            .value());
    assertEquals(200, post(publish("locked-rule", "publish-lock")).getStatusCode().value());

    var response =
        post(define("locked-rule", "field('name') == 'x'", "name", "define-after-publish"));

    assertEquals(409, response.getStatusCode().value());
    assertEquals("RULE-409-PUBLISHED-IMMUTABLE", errorCode(response));
    assertEquals(
        "field('name') == null",
        value("SELECT when_src FROM rule_def WHERE rule_code = 'locked-rule'"));
  }

  @Test
  void hotPathBlockRejectsCreateObjectWithoutWrites() {
    assertEquals(
        200,
        post(define("block-name", "field('name') == 'bad'", "name", "define-block"))
            .getStatusCode()
            .value());
    assertEquals(200, post(publish("block-name", "publish-block")).getStatusCode().value());

    var response = postCommand(createObject("create-blocked", TYPE, Map.of("name", "bad")));

    assertEquals(422, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("RULE-422-RULE-VIOLATION", errorCode(response));
    assertEquals(0, count("data_object"));
    assertEquals(0, count("event_outbox"));
    assertEquals(0, count("command_log WHERE command_type = 'CreateObject'"));
  }

  @Test
  void hotPathWarnDoesNotBlockCreateObject() {
    assertEquals(
        200,
        post(define("warn-name", "field('name') == 'bad'", "name", "define-warn", "WARN", true))
            .getStatusCode()
            .value());
    assertEquals(200, post(publish("warn-name", "publish-warn")).getStatusCode().value());

    var response = postCommand(createObject("create-warn", TYPE, Map.of("name", "bad")));

    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals(1, count("data_object"));
  }

  @Test
  void hotPathIgnoresNonLightweightRules() {
    assertEquals(
        200,
        post(define("cold-only", "field('name') == 'bad'", "name", "define-cold", "BLOCK", false))
            .getStatusCode()
            .value());
    assertEquals(200, post(publish("cold-only", "publish-cold")).getStatusCode().value());

    var response = postCommand(createObject("create-cold", TYPE, Map.of("name", "bad")));

    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals(1, count("data_object"));
  }

  @Test
  void hotPathAppliesParentTypeRulesToSubtypeInstance() {
    insertChildType();
    assertEquals(
        200,
        post(define("parent-rule", "field('name') == 'bad'", "name", "define-parent-rule"))
            .getStatusCode()
            .value());
    assertEquals(200, post(publish("parent-rule", "publish-parent-rule")).getStatusCode().value());

    var response =
        postCommand(createObject("create-child-blocked", CHILD_TYPE, Map.of("name", "bad")));

    assertEquals(422, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("RULE-422-RULE-VIOLATION", errorCode(response));
    assertEquals(0, count("data_object"));
  }

  private Map<String, Object> define(
      String ruleCode, String when, String fieldCode, String idempotencyKey) {
    return defineWithScope(ruleCode, "demo_object", fieldCode, idempotencyKey, when);
  }

  private Map<String, Object> define(
      String ruleCode,
      String when,
      String fieldCode,
      String idempotencyKey,
      String severity,
      boolean lightweight) {
    return defineWithScope(
        ruleCode, "demo_object", fieldCode, idempotencyKey, when, severity, lightweight);
  }

  private Map<String, Object> defineWithScope(
      String ruleCode, String objectTypeCode, String fieldCode, String idempotencyKey) {
    return defineWithScope(
        ruleCode, objectTypeCode, fieldCode, idempotencyKey, "field('name') == null");
  }

  private Map<String, Object> defineWithScope(
      String ruleCode,
      String objectTypeCode,
      String fieldCode,
      String idempotencyKey,
      String when) {
    return defineWithScope(
        ruleCode, objectTypeCode, fieldCode, idempotencyKey, when, "BLOCK", true);
  }

  private Map<String, Object> defineWithScope(
      String ruleCode,
      String objectTypeCode,
      String fieldCode,
      String idempotencyKey,
      String when,
      String severity,
      boolean lightweight) {
    var scope = new LinkedHashMap<String, Object>();
    scope.put("objectTypeCode", objectTypeCode);
    if (fieldCode != null) {
      scope.put("fieldCode", fieldCode);
    }
    var payload = new LinkedHashMap<String, Object>();
    payload.put("ruleCode", ruleCode);
    payload.put("scope", scope);
    payload.put("severity", severity);
    payload.put("when", when);
    payload.put("message", "message ${field('name')}");
    payload.put("lightweight", lightweight);
    return command("DefineRule", idempotencyKey, payload);
  }

  private Map<String, Object> publish(String ruleCode, String idempotencyKey) {
    return command("PublishRule", idempotencyKey, Map.of("ruleCode", ruleCode));
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

  private Map<String, Object> createObject(
      String idempotencyKey, UUID objectTypeId, Map<String, Object> fields) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeId", objectTypeId);
    payload.put("fields", fields);
    payload.put("source", Map.of("type", "manual"));
    return command("CreateObject", idempotencyKey, payload);
  }

  private ResponseEntity<Map> post(Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "rule-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + WORKSPACE + "/rule-commands",
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private ResponseEntity<Map> postCommand(Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "rule-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + WORKSPACE + "/commands",
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

  private void insertOtherTypeAndField() {
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, code, name, published, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, 'other_type', 'Other Type', TRUE, 'test', 'test', now(), now())
        """,
        OTHER_TYPE,
        WORKSPACE);
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, code, name, required, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, 'foreign', 'Foreign', FALSE, 'test', 'test', now(), now())
        """,
        OTHER_FIELD,
        OTHER_TYPE);
  }

  private void insertChildType() {
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, code, name, parent_type_id, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, 'rule_child_object', 'Rule Child Object', ?, TRUE, 'test', 'test', now(), now())
        """,
        CHILD_TYPE,
        WORKSPACE,
        TYPE);
  }
}
