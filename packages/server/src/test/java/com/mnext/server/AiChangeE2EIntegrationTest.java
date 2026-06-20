package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
class AiChangeE2EIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID TYPE = UUID.fromString("99999999-0000-4000-8000-000000000001");
  private static final UUID PRIORITY = UUID.fromString("99999999-0000-4000-8000-000000000002");
  private static final UUID SCORE = UUID.fromString("99999999-0000-4000-8000-000000000003");
  private static final UUID BLOCKED = UUID.fromString("99999999-0000-4000-8000-000000000004");
  private static final UUID OBJECT = UUID.fromString("99999999-0000-4000-8000-000000000005");
  private static final UUID CHECK = UUID.fromString("99999999-0000-4000-8000-000000000006");

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
    jdbc.update("DELETE FROM rm_ai_change_item");
    jdbc.update("DELETE FROM rm_ai_change_set");
    jdbc.update("DELETE FROM ai_change_item");
    jdbc.update("DELETE FROM ai_change_set");
    jdbc.update("DELETE FROM check_result");
    jdbc.update("DELETE FROM rule_def WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM command_log");
    jdbc.update("DELETE FROM rm_object WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM data_field_value");
    jdbc.update("DELETE FROM data_object WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM field_def WHERE object_type_id = ?", TYPE);
    jdbc.update("DELETE FROM object_type WHERE id = ?", TYPE);
    insertProfile();
  }

  @Test
  void proposeSuggestFieldsPrechecksExplainsRejectsAndReplays() {
    var propose = command("ProposeAiChange", "ai-propose", suggestPayload());
    var proposed = post(propose);
    var setId = eventId(proposed);
    var view = single(get("/views/ai-changes?setId=" + setId));

    assertEquals(200, proposed.getStatusCode().value(), String.valueOf(proposed.getBody()));
    assertEquals("stub", view.get("provider"));
    assertFalse(((String) view.get("contextHash")).isBlank());
    var verdicts = verdictsByField(view);
    assertEquals("WRITABLE", verdicts.get("priority"));
    assertEquals("WARN", verdicts.get("score"));
    assertEquals("BLOCKED", verdicts.get("blocked_number"));
    assertEquals("{}", fieldSnapshot());

    var replay = post(propose);
    assertTrue((Boolean) replay.getBody().get("idempotentReplay"));
    assertEquals(1, count("ai_change_set WHERE action = 'SUGGEST_FIELDS'"));

    var secondSetId = eventId(post(command("ProposeAiChange", "ai-propose-2", suggestPayload())));
    var secondView = single(get("/views/ai-changes?setId=" + secondSetId));
    assertEquals(view.get("contextHash"), secondView.get("contextHash"));

    var explain = post(command("ProposeAiChange", "ai-explain", explainPayload()));
    var explainView = single(get("/views/ai-changes?setId=" + eventId(explain)));
    assertTrue(((String) explainView.get("resultText")).contains("ai_check_rule"));
    assertTrue(((List<?>) explainView.get("items")).isEmpty());

    var rejected = post(command("RejectAiChange", "ai-reject", Map.of("setId", setId)));
    assertEquals(200, rejected.getStatusCode().value(), String.valueOf(rejected.getBody()));
    assertEquals("REJECTED", single(get("/views/ai-changes?status=REJECTED")).get("status"));
  }

  @Test
  void rejectMissingSetAndBadActionReturnAiErrors() {
    var missing = post(command("RejectAiChange", "ai-missing", Map.of("setId", UUID.randomUUID())));
    var bad = post(command("ProposeAiChange", "ai-bad", Map.of("action", "WRITE_DIRECTLY")));

    assertEquals(404, missing.getStatusCode().value());
    assertEquals("AI-404-CHANGESET-NOT-FOUND", errorCode(missing));
    assertEquals(400, bad.getStatusCode().value());
    assertEquals("AI-400-SCHEMA-INVALID", errorCode(bad));
  }

  private Map<String, Object> suggestPayload() {
    return Map.of(
        "action",
        "SUGGEST_FIELDS",
        "selection",
        Map.of("objectIds", List.of(OBJECT)),
        "instruction",
        "补齐必填字段");
  }

  private Map<String, Object> explainPayload() {
    return Map.of("action", "EXPLAIN_CHECK", "selection", Map.of("checkResultIds", List.of(CHECK)));
  }

  private Map<String, Object> command(
      String commandType, String idempotencyKey, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("commandType", commandType);
    request.put("workspaceId", WORKSPACE);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", idempotencyKey);
    request.put("payload", payload);
    return request;
  }

  private ResponseEntity<Map> post(Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "ai-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + WORKSPACE + "/ai-commands",
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private List<Map<String, Object>> get(String path) {
    return http.getForEntity(
            "http://localhost:" + port + "/workspaces/" + WORKSPACE + path, List.class)
        .getBody();
  }

  private Map<String, Object> single(List<Map<String, Object>> values) {
    assertEquals(1, values.size(), String.valueOf(values));
    return values.getFirst();
  }

  private Map<String, String> verdictsByField(Map<String, Object> view) {
    var verdicts = new LinkedHashMap<String, String>();
    for (var item : (List<Map<String, Object>>) view.get("items")) {
      var payload = (Map<String, Object>) item.get("payload");
      var field = (Map<String, Object>) ((List<?>) payload.get("fields")).getFirst();
      var precheck = (Map<String, Object>) item.get("precheck");
      verdicts.put((String) field.get("fieldDefCode"), (String) precheck.get("verdict"));
    }
    return verdicts;
  }

  private String eventId(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (String) ((List<?>) response.getBody().get("events")).getFirst();
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }

  private String fieldSnapshot() {
    return jdbc.queryForObject(
        "SELECT fields::text FROM rm_object WHERE workspace_id = ? AND object_id = ?",
        String.class,
        WORKSPACE,
        OBJECT);
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private void insertProfile() {
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, code, name, published, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, 'ai_demo_object', 'AI Demo Object', TRUE, 'test', 'test', now(), now())
        """,
        TYPE,
        WORKSPACE);
    insertField(PRIORITY, "priority", "string", "{\"enum\":[\"LOW\",\"HIGH\"]}");
    insertField(SCORE, "score", "number", "{}");
    insertField(BLOCKED, "blocked_number", "number", "{}");
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, 'ai_demo_object', 'DRAFT', 3, '{}'::jsonb, now())
        """,
        WORKSPACE,
        OBJECT);
    insertRule("warn_score", SCORE, "WARN", "field('score') == 0", "score warned");
    insertRule("block_number", BLOCKED, "BLOCK", "field('blocked_number') == 0", "number blocked");
    jdbc.update(
        """
        INSERT INTO check_result
          (id, workspace_id, run_id, rule_code, severity, message,
           object_id, field_code, config_hash, created_at)
        VALUES (?, ?, ?, 'ai_check_rule', 'WARN', '需要解释',
                ?, 'score', repeat('a', 64), now())
        """,
        CHECK,
        WORKSPACE,
        UUID.randomUUID(),
        OBJECT);
  }

  private void insertField(UUID id, String code, String dataType, String constraints) {
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, code, name, required, data_type, constraints,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, TRUE, ?, CAST(? AS jsonb), 'test', 'test', now(), now())
        """,
        id,
        TYPE,
        code,
        code,
        dataType,
        constraints);
  }

  private void insertRule(
      String ruleCode, UUID fieldId, String severity, String when, String message) {
    jdbc.update(
        """
        INSERT INTO rule_def
          (id, workspace_id, rule_code, scope_object_type_id, scope_field_def_id,
           severity, when_src, message, lightweight, published, version,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, 1, 'test', 'test', now(), now())
        """,
        UUID.randomUUID(),
        WORKSPACE,
        ruleCode,
        TYPE,
        fieldId,
        severity,
        when,
        message);
  }
}
