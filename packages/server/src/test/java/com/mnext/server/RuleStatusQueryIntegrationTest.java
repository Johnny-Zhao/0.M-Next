package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
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
class RuleStatusQueryIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID EMPTY_WORKSPACE =
      UUID.fromString("99999999-9999-4999-8999-999999999999");
  private static final UUID BLOCKED = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  private static final UUID WARNED = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  private static final UUID INFO_ONLY = UUID.fromString("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  private static final UUID NO_RESULT = UUID.fromString("dddddddd-dddd-4ddd-8ddd-dddddddddddd");

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));

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
    jdbc.update("DELETE FROM check_result");
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
    jdbc.update("DELETE FROM workspace WHERE id = ?", EMPTY_WORKSPACE);
  }

  @Test
  void exposesLatestBatchRuleStatusesOnObjectsAndBatchEndpoint() {
    insertObject(WORKSPACE, BLOCKED);
    insertObject(WORKSPACE, WARNED);
    insertObject(WORKSPACE, INFO_ONLY);
    insertObject(WORKSPACE, NO_RESULT);
    var oldRun = UUID.fromString("10000000-0000-4000-8000-000000000001");
    var newRun = UUID.fromString("20000000-0000-4000-8000-000000000002");
    insertResult(WORKSPACE, oldRun, INFO_ONLY, "BLOCK", "2026-06-20T10:00:00Z");
    insertResult(WORKSPACE, newRun, BLOCKED, "WARN", "2026-06-20T11:00:00Z");
    insertResult(WORKSPACE, newRun, BLOCKED, "BLOCK", "2026-06-20T11:00:01Z");
    insertResult(WORKSPACE, newRun, WARNED, "WARN", "2026-06-20T11:00:02Z");
    insertResult(WORKSPACE, newRun, INFO_ONLY, "INFO", "2026-06-20T11:00:03Z");

    var detail = get("/views/objects/" + BLOCKED);
    var statuses =
        getList(
            "/views/rule-status?objectIds="
                + BLOCKED
                + "&objectIds="
                + WARNED
                + "&objectIds="
                + INFO_ONLY
                + "&objectIds="
                + NO_RESULT);
    var page = get("/views/objects?objectType=demo_object&page=0&pageSize=200");

    assertEquals("BLOCK", ((Map<?, ?>) detail.get("object")).get("ruleStatus"));
    assertEquals(
        Map.of(
            BLOCKED.toString(),
            "BLOCK",
            WARNED.toString(),
            "WARN",
            INFO_ONLY.toString(),
            "OK",
            NO_RESULT.toString(),
            "OK"),
        byObjectId(statuses));
    assertEquals("OK", ((Map<?, ?>) ((List<?>) page.get("items")).get(2)).get("ruleStatus"));
  }

  @Test
  void returnsUnknownWithoutAnyBatchAndRejectsOversizedBatch() {
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, 'No Rule Runs', 'ACTIVE')",
        EMPTY_WORKSPACE);
    insertObject(EMPTY_WORKSPACE, NO_RESULT);

    var detail = get(EMPTY_WORKSPACE, "/views/objects/" + NO_RESULT);
    var objectIds = new StringBuilder();
    for (int index = 0; index < 201; index++) {
      if (index > 0) objectIds.append(',');
      objectIds.append("00000000-0000-4000-8000-");
      objectIds.append(String.format("%012d", index));
    }

    assertEquals("UNKNOWN", ((Map<?, ?>) detail.get("object")).get("ruleStatus"));
    assertEquals(400, status("/views/rule-status?objectIds=" + objectIds));
  }

  private void insertObject(UUID workspaceId, UUID objectId) {
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, 'demo_object', 'DRAFT', 1, ?::jsonb, now())
        """,
        workspaceId,
        objectId,
        "{\"name\":\"" + objectId.toString().substring(0, 8) + "\"}");
  }

  private void insertResult(
      UUID workspaceId, UUID runId, UUID objectId, String severity, String createdAt) {
    jdbc.update(
        """
        INSERT INTO check_result
          (id, workspace_id, run_id, rule_code, severity, message,
           object_id, field_code, config_hash, created_at)
        VALUES (?, ?, ?, ?, ?, 'fixture', ?, NULL, ?, ?)
        """,
        UUID.randomUUID(),
        workspaceId,
        runId,
        "rule_" + severity.toLowerCase(),
        severity,
        objectId,
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        Timestamp.from(Instant.parse(createdAt)));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(String path) {
    return get(WORKSPACE, path);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(UUID workspaceId, String path) {
    var response = http.getForEntity(base(workspaceId) + path, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> getList(String path) {
    var response = http.getForEntity(base(WORKSPACE) + path, List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private int status(String path) {
    return http.getForEntity(base(WORKSPACE) + path, Map.class).getStatusCode().value();
  }

  private Map<String, String> byObjectId(List<Map<String, Object>> statuses) {
    var result = new java.util.LinkedHashMap<String, String>();
    for (var status : statuses) {
      result.put((String) status.get("objectId"), (String) status.get("ruleStatus"));
    }
    return result;
  }

  private String base(UUID workspaceId) {
    return "http://localhost:" + port + "/workspaces/" + workspaceId;
  }
}
