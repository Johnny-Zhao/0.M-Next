package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
import org.springframework.http.HttpMethod;
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
    properties = {"mnext.outbox.enabled=false"})
class RbacE2EIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID OTHER_WORKSPACE =
      UUID.fromString("99999999-9999-4999-8999-999999999999");
  private static final UUID TYPE = UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final UUID A = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  private static final UUID B = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  private static final UUID C = UUID.fromString("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  private static final UUID D = UUID.fromString("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  private static final UUID E = UUID.fromString("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");

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
  void clean() {
    jdbc.update("DELETE FROM annotation");
    jdbc.update("DELETE FROM workspace_member");
    jdbc.update("DELETE FROM app_user");
    jdbc.update("DELETE FROM relation_closure");
    jdbc.update("DELETE FROM relation_history");
    jdbc.update("DELETE FROM data_relation");
    jdbc.update("DELETE FROM event_outbox");
    jdbc.update("DELETE FROM command_log");
    jdbc.update("DELETE FROM field_value_history");
    jdbc.update("DELETE FROM data_field_value");
    jdbc.update("DELETE FROM data_object");
    jdbc.update("DELETE FROM workspace WHERE id = ?", OTHER_WORKSPACE);
  }

  @Test
  void rbacBootstrapRolesAndIdempotencyCoverWorkspaceGovernance() {
    assertEquals(
        200,
        postCommand("test-user", WORKSPACE, "CreateObject", "bootstrap-open")
            .getStatusCode()
            .value());

    var grantRequest =
        envelope(
            "GrantWorkspaceRole",
            WORKSPACE,
            "grant-b-viewer",
            Map.of("userId", B, "role", "VIEWER"));
    var firstGrant = post(A, "/workspaces/" + WORKSPACE + "/rbac-commands", grantRequest);
    var replayGrant = post(A, "/workspaces/" + WORKSPACE + "/rbac-commands", grantRequest);
    assertEquals(200, firstGrant.getStatusCode().value());
    assertEquals(200, replayGrant.getStatusCode().value());
    assertEquals(Boolean.TRUE, replayGrant.getBody().get("idempotentReplay"));
    assertEquals(2, memberCount(WORKSPACE));

    assertEquals(
        403, postCommand(B, WORKSPACE, "CreateObject", "viewer-write").getStatusCode().value());
    assertEquals(
        200,
        get(B, "/workspaces/" + WORKSPACE + "/views/object-types", Object[].class)
            .getStatusCode()
            .value());
    assertEquals(200, postMeta(A, "DefineObjectType", "admin-define").getStatusCode().value());

    assertEquals(200, grant(A, C, "AUTHOR", "grant-c-author").getStatusCode().value());
    assertEquals(
        200, postCommand(C, WORKSPACE, "CreateObject", "author-write").getStatusCode().value());
    assertEquals(403, grant(C, E, "VIEWER", "author-grant").getStatusCode().value());

    assertEquals(200, grant(A, D, "REVIEWER", "grant-d-reviewer").getStatusCode().value());
    var objectId = latestObjectId();
    assertEquals(200, postReview(D, objectId).getStatusCode().value());

    var unknown = UUID.fromString("12121212-1212-4121-8121-121212121212");
    assertEquals(
        401, postCommand(unknown, WORKSPACE, "CreateObject", "unknown").getStatusCode().value());

    seedGovernedWorkspaceWithoutA();
    assertEquals(
        403, postCommand(A, OTHER_WORKSPACE, "CreateObject", "cross").getStatusCode().value());

    assertEquals(400, grant(A, E, "OWNER", "bad-role").getStatusCode().value());
  }

  private ResponseEntity<Map> grant(UUID actor, UUID userId, String role, String key) {
    return post(
        actor,
        "/workspaces/" + WORKSPACE + "/rbac-commands",
        envelope("GrantWorkspaceRole", WORKSPACE, key, Map.of("userId", userId, "role", role)));
  }

  private ResponseEntity<Map> postCommand(
      Object actor, UUID workspaceId, String commandType, String key) {
    return post(
        actor,
        "/workspaces/" + workspaceId + "/commands",
        envelope(
            commandType,
            workspaceId,
            key,
            Map.of(
                "objectTypeId",
                TYPE,
                "fields",
                Map.of("name", key),
                "source",
                Map.of("type", "manual"))));
  }

  private ResponseEntity<Map> postMeta(UUID actor, String commandType, String key) {
    return post(
        actor,
        "/workspaces/" + WORKSPACE + "/meta-commands",
        envelope(
            commandType,
            WORKSPACE,
            key,
            Map.of("code", "rbac_" + key.replace('-', '_'), "name", key)));
  }

  private ResponseEntity<Map> postReview(UUID actor, UUID targetId) {
    return post(
        actor,
        "/workspaces/" + WORKSPACE + "/review/commands",
        envelope(
            "CreateAnnotation",
            WORKSPACE,
            "review-" + targetId,
            Map.of(
                "targetType",
                "object",
                "targetId",
                targetId,
                "anchoredDataVersion",
                1,
                "severity",
                "info",
                "body",
                "review body")));
  }

  private Map<String, Object> envelope(
      String commandType, UUID workspaceId, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("commandType", commandType);
    request.put("workspaceId", workspaceId.toString());
    request.put("correlationId", UUID.randomUUID().toString());
    request.put("idempotencyKey", key);
    request.put("payload", payload);
    return request;
  }

  private ResponseEntity<Map> post(Object actor, String path, Map<String, Object> request) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", actor.toString());
    return http.postForEntity(base() + path, new HttpEntity<>(request, headers), Map.class);
  }

  private <T> ResponseEntity<T> get(UUID actor, String path, Class<T> responseType) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", actor.toString());
    return http.exchange(
        base() + path, HttpMethod.GET, new HttpEntity<>(null, headers), responseType);
  }

  private UUID latestObjectId() {
    return jdbc.queryForObject(
        "SELECT id FROM data_object WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1",
        UUID.class,
        WORKSPACE);
  }

  private int memberCount(UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM workspace_member WHERE workspace_id = ?", Integer.class, workspaceId);
  }

  private void seedGovernedWorkspaceWithoutA() {
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, 'Other Workspace', 'ACTIVE')",
        OTHER_WORKSPACE);
    jdbc.update("INSERT INTO app_user (id, display_name, status) VALUES (?, ?, 'ACTIVE')", E, "E");
    jdbc.update(
        "INSERT INTO workspace_member (workspace_id, user_id, role, granted_by) VALUES (?, ?, 'ADMIN', ?)",
        OTHER_WORKSPACE,
        E,
        E.toString());
  }

  private String base() {
    return "http://localhost:" + port;
  }
}
