package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
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
class TemplateLifecycleRuleIntegrationTest {
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
  void instantiateCopiesTemplateRulesAndHotPathUsesResolvedScope() {
    var template = template("rule_copy_tpl");
    var version = templateVersion(template, 1, "draft");
    var type = templateObject(AUTHOR, version, "rule_copy_type", "Rule Copy Type");
    templateField(type, version, "name", "Name", true);
    templateRule(AUTHOR, version, "copy-block", type, "name", "field('name') == 'bad'");
    assertEquals(200, meta(AUTHOR, publish(version, "publish-copy-rules")).getStatusCode().value());
    var target = UUID.randomUUID();

    assertEquals(
        200,
        meta(AUTHOR, instantiate(template, target, "instantiate-copy-rules"))
            .getStatusCode()
            .value());

    assertEquals(1, countRules(target, "copy-block"));
    assertEquals(0, countRuleScopeOutsideWorkspace(target, "copy-block"));
    var objectType = objectType(target, "rule_copy_type");
    var response = command(target, createObject(target, objectType, "create-copy-block", "bad"));
    assertEquals(422, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("RULE-422-RULE-VIOLATION", errorCode(response));
  }

  @Test
  void applyCopiesOnlyNewRulesAndKeepsExistingTargetRule() {
    var template = template("rule_apply_tpl");
    var version1 = templateVersion(template, 1, "draft");
    var type1 = templateObject(AUTHOR, version1, "rule_apply_type", "Rule Apply Type");
    templateField(type1, version1, "name", "Name", true);
    templateRule(AUTHOR, version1, "existing-rule", type1, "name", "field('name') == 'old'");
    assertEquals(
        200, meta(AUTHOR, publish(version1, "publish-apply-rules-v1")).getStatusCode().value());
    var target = UUID.randomUUID();
    assertEquals(
        200,
        meta(AUTHOR, instantiate(template, target, "instantiate-apply-rules"))
            .getStatusCode()
            .value());
    jdbc.update(
        "UPDATE rule_def SET message = 'target override' WHERE workspace_id = ? AND rule_code = ?",
        target,
        "existing-rule");
    var authorV2 = authorWorkspace("rule_apply_v2_author");
    var version2 = templateVersion(template, 2, "published");
    var type2 = templateObject(authorV2, version2, "rule_apply_type", "Rule Apply Type");
    templateField(type2, version2, "name", "Name", true);
    templateRule(authorV2, version2, "existing-rule", type2, "name", "field('name') == 'new'");
    templateRule(authorV2, version2, "new-rule", type2, "name", "field('name') == 'bad'");

    assertEquals(200, meta(target, apply(target, "apply-rules-v2")).getStatusCode().value());

    assertEquals(1, countRules(target, "existing-rule"));
    assertEquals(1, countRules(target, "new-rule"));
    assertEquals(
        "target override",
        value(
            "SELECT message FROM rule_def WHERE workspace_id = '"
                + target
                + "' AND rule_code = 'existing-rule'"));
    assertEquals(0, countRuleScopeOutsideWorkspace(target, "new-rule"));
  }

  private UUID template(String code) {
    var template = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template (id, code, name, created_by, created_at)
        VALUES (?, ?, ?, 'test', CURRENT_TIMESTAMP)
        """,
        template,
        code + "_" + template.toString().substring(0, 8),
        code);
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

  private UUID authorWorkspace(String name) {
    var workspace = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, ?, 'ACTIVE')", workspace, name);
    return workspace;
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

  private UUID templateField(
      UUID objectType, UUID version, String code, String name, boolean required) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, template_version_id, code, name, required, data_type,
           constraints, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'string', '{}'::jsonb, 'test', 'test',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        id,
        objectType,
        version,
        code,
        name,
        required);
    return id;
  }

  private void templateRule(
      UUID workspace, UUID version, String code, UUID objectType, String fieldCode, String when) {
    var field =
        jdbc.queryForObject(
            "SELECT id FROM field_def WHERE object_type_id = ? AND code = ?",
            UUID.class,
            objectType,
            fieldCode);
    jdbc.update(
        """
        INSERT INTO rule_def
          (id, workspace_id, template_version_id, rule_code, scope_object_type_id,
           scope_field_def_id, severity, when_src, message, lightweight, published, version,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'BLOCK', ?, 'blocked ${field(''name'')}', TRUE, TRUE, 2,
          'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        UUID.randomUUID(),
        workspace,
        version,
        code,
        objectType,
        field,
        when);
  }

  private Map<String, Object> publish(UUID version, String key) {
    return metaCommand("PublishTemplateVersion", AUTHOR, key, Map.of("templateVersionId", version));
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

  private Map<String, Object> apply(UUID workspace, String key) {
    return metaCommand("ApplyTemplateVersion", workspace, key, Map.of("toVersion", 2));
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

  private Map<String, Object> createObject(
      UUID workspace, UUID objectType, String key, String name) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeId", objectType);
    payload.put("fields", Map.of("name", name));
    payload.put("source", Map.of("type", "manual"));
    return command("CreateObject", workspace, key, payload);
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
    headers.set("X-Actor-Id", "template-rule-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + workspace + path,
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private UUID objectType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private int countRules(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM rule_def WHERE workspace_id = ? AND rule_code = ?",
        Integer.class,
        workspace,
        code);
  }

  private int countRuleScopeOutsideWorkspace(UUID workspace, String code) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM rule_def rule
        JOIN object_type type ON type.id = rule.scope_object_type_id
        LEFT JOIN field_def field ON field.id = rule.scope_field_def_id
        LEFT JOIN object_type field_type ON field_type.id = field.object_type_id
        WHERE rule.workspace_id = ? AND rule.rule_code = ?
          AND (type.workspace_id <> ? OR (field.id IS NOT NULL AND field_type.workspace_id <> ?))
        """,
        Integer.class,
        workspace,
        code,
        workspace,
        workspace);
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }

  private Object value(String sql) {
    return jdbc.queryForObject(sql, Object.class);
  }
}
