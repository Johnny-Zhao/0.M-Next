package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
    properties = {"mnext.outbox.enabled=false", "mnext.readmodel.enabled=false"})
class TemplateWithdrawIntegrationTest {
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
  @LocalServerPort int port;

  @Test
  void withdrawHidesTemplateRejectsNewInstantiateAndRestoreReenablesIt() {
    var template = template("withdraw_tpl");
    var version = templateVersion(template, 1, "draft");
    templateObject(AUTHOR, version, "withdraw_type", "Withdraw Type");
    assertEquals(200, meta(AUTHOR, publish(version, "publish-withdraw")).getStatusCode().value());
    var existingWorkspace = UUID.randomUUID();
    assertEquals(
        200,
        meta(AUTHOR, instantiate(template, existingWorkspace, "instantiate-before-withdraw"))
            .getStatusCode()
            .value());
    assertTrue(templateCodes().contains(code(template)));

    assertEquals(200, meta(AUTHOR, withdraw(version, "withdraw-template")).getStatusCode().value());

    assertEquals(
        "withdrawn", value("SELECT status FROM scene_template_version WHERE id = ?", version));
    assertFalse(templateCodes().contains(code(template)));
    var rejected = meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-withdrawn"));
    assertEquals(422, rejected.getStatusCode().value(), String.valueOf(rejected.getBody()));
    assertEquals("KERNEL-422-TEMPLATE-NOT-PUBLISHED", errorCode(rejected));
    assertExistingWorkspaceStillWritable(existingWorkspace);

    assertEquals(200, meta(AUTHOR, restore(version, "restore-template")).getStatusCode().value());

    assertEquals(
        "published", value("SELECT status FROM scene_template_version WHERE id = ?", version));
    assertTrue(templateCodes().contains(code(template)));
    assertEquals(
        200,
        meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-after-restore"))
            .getStatusCode()
            .value());
  }

  @Test
  void illegalStateTransitionsAreRejected() {
    var template = template("withdraw_illegal_tpl");
    var version = templateVersion(template, 1, "draft");
    templateObject(AUTHOR, version, "withdraw_illegal_type", "Withdraw Illegal Type");

    var withdrawDraft = meta(AUTHOR, withdraw(version, "withdraw-draft"));
    assertEquals(
        409, withdrawDraft.getStatusCode().value(), String.valueOf(withdrawDraft.getBody()));
    assertEquals("KERNEL-409-STATE-TRANSITION-INVALID", errorCode(withdrawDraft));

    var instantiateDraft =
        meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-draft"));
    assertEquals(
        422, instantiateDraft.getStatusCode().value(), String.valueOf(instantiateDraft.getBody()));
    assertEquals("KERNEL-422-TEMPLATE-NOT-PUBLISHED", errorCode(instantiateDraft));
  }

  private UUID template(String baseCode) {
    var template = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template (id, code, name, created_by, created_at)
        VALUES (?, ?, ?, 'test', CURRENT_TIMESTAMP)
        """,
        template,
        baseCode + "_" + template.toString().substring(0, 8),
        baseCode);
    return template;
  }

  private UUID templateVersion(UUID template, int version, String status) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template_version (id, template_id, version, status)
        VALUES (?, ?, ?, ?)
        """,
        id,
        template,
        version,
        status);
    return id;
  }

  private UUID templateObject(UUID workspace, UUID version, String code, String name) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, template_version_id, code, name, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, FALSE, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        id,
        workspace,
        version,
        code,
        name);
    return id;
  }

  private void assertExistingWorkspaceStillWritable(UUID workspace) {
    var objectType =
        jdbc.queryForObject(
            "SELECT id FROM object_type WHERE workspace_id = ? AND code = 'withdraw_type'",
            UUID.class,
            workspace);
    var response = command(workspace, createObject(workspace, objectType, "create-after-withdraw"));
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private Map<String, Object> publish(UUID version, String key) {
    return metaCommand("PublishTemplateVersion", AUTHOR, key, Map.of("templateVersionId", version));
  }

  private Map<String, Object> withdraw(UUID version, String key) {
    return metaCommand(
        "WithdrawTemplateVersion", AUTHOR, key, Map.of("templateVersionId", version));
  }

  private Map<String, Object> restore(UUID version, String key) {
    return metaCommand("RestoreTemplateVersion", AUTHOR, key, Map.of("templateVersionId", version));
  }

  private Map<String, Object> instantiate(UUID template, UUID newWorkspace, String key) {
    return metaCommand(
        "InstantiateWorkspace",
        AUTHOR,
        key,
        Map.of(
            "templateId",
            template,
            "version",
            1,
            "newWorkspaceId",
            newWorkspace,
            "workspaceName",
            "instantiated"));
  }

  private Map<String, Object> createObject(UUID workspace, UUID objectType, String key) {
    return command(
        "CreateObject",
        workspace,
        key,
        Map.of("objectTypeId", objectType, "fields", Map.of(), "source", Map.of("type", "manual")));
  }

  private Map<String, Object> metaCommand(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", workspace);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", key);
    request.put("commandType", type);
    request.put("payload", payload);
    return request;
  }

  private Map<String, Object> command(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", workspace);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", key);
    request.put("commandType", type);
    request.put("payload", payload);
    return request;
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> command(UUID workspace, Object request) {
    return post(workspace, "/commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "template-withdraw-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + workspace + path,
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private List<String> templateCodes() {
    var response =
        http.getForEntity("http://localhost:" + port + "/views/templates", List.class).getBody();
    return response.stream().map(item -> (String) ((Map<?, ?>) item).get("code")).toList();
  }

  private String code(UUID template) {
    return jdbc.queryForObject(
        "SELECT code FROM scene_template WHERE id = ?", String.class, template);
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }

  private String value(String sql, Object argument) {
    return jdbc.queryForObject(sql, String.class, argument);
  }
}
