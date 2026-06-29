package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
class ReusableAssemblyIntegrationTest {
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
  void definesListsAndPlacesAssemblyThroughKernelCreateCommands() {
    var workspace = UUID.randomUUID();
    var templateVersion = UUID.randomUUID();
    var component = UUID.randomUUID();
    var link = UUID.randomUUID();
    insertProfile(workspace, templateVersion, component, link);

    var define =
        postMeta(
            workspace,
            "DefineReusableAssembly",
            "define-battery-pack",
            definePayload(templateVersion));
    assertOk(define);
    var replay =
        postMeta(
            workspace,
            "DefineReusableAssembly",
            "define-battery-pack-replay",
            definePayload(templateVersion));
    assertOk(replay);
    assertTrue((Boolean) replay.getBody().get("idempotentReplay"));
    var assemblyId =
        UUID.fromString((String) ((List<?>) define.getBody().get("events")).getFirst());

    var catalog = get(workspace, "/views/reusable-assemblies?profile=reuse_profile");
    assertEquals(1, ((List<?>) catalog.getBody().get("items")).size());

    var placed = postAssembly(workspace, "place-battery-pack", placePayload(assemblyId, "slot-a"));
    assertOk(placed);
    assertEquals(2, count("data_object", workspace));
    assertEquals(1, count("data_relation", workspace));
    assertEquals(2, commandCount(workspace, "CreateObject"));
    assertEquals(1, commandCount(workspace, "CreateRelation"));
    assertEquals(3, placedEventCount(workspace, "system"));
    assertTrue(fieldValues("name").contains("Battery A"));

    var placedReplay =
        postAssembly(workspace, "place-battery-pack", placePayload(assemblyId, "slot-a"));
    assertOk(placedReplay);
    assertTrue((Boolean) placedReplay.getBody().get("idempotentReplay"));
    assertEquals(2, count("data_object", workspace));
    assertEquals(1, count("data_relation", workspace));
  }

  private Map<String, Object> definePayload(UUID templateVersion) {
    return Map.of(
        "templateVersionId",
        templateVersion.toString(),
        "name",
        "Battery Pack",
        "params",
        Map.of("name", "Battery Pack"),
        "content",
        Map.of(
            "objects",
            List.of(
                Map.of(
                    "key", "pack", "objectType", "component", "fields", Map.of("name", "${name}")),
                Map.of(
                    "key",
                    "controller",
                    "objectType",
                    "component",
                    "fields",
                    Map.of("name", "Controller"))),
            "relations",
            List.of(Map.of("relationType", "contains", "source", "pack", "target", "controller"))));
  }

  private Map<String, Object> placePayload(UUID assemblyId, String placementKey) {
    return Map.of(
        "assemblyId",
        assemblyId.toString(),
        "version",
        1,
        "placementKey",
        placementKey,
        "params",
        Map.of("name", "Battery A"));
  }

  private void insertProfile(UUID workspace, UUID version, UUID component, UUID link) {
    var template = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, 'Reuse workspace', 'ACTIVE')",
        workspace);
    jdbc.update(
        "INSERT INTO scene_template (id, code, name, created_by, created_at) VALUES (?, 'reuse_profile', 'Reuse Profile', 'test', now())",
        template);
    jdbc.update(
        "INSERT INTO scene_template_version (id, template_id, version, status) VALUES (?, ?, 1, 'published')",
        version,
        template);
    jdbc.update(
        "INSERT INTO workspace_profile (workspace_id, template_version_id, applied_by, applied_at) VALUES (?, ?, 'test', now())",
        workspace,
        version);
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, template_version_id, code, name, parent_type_id, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, 'component', 'Component', NULL, TRUE, 'test', 'test', now(), now())
        """,
        component,
        workspace,
        version);
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, template_version_id, code, name, required, data_type, constraints,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, 'name', 'Name', TRUE, 'string', '{}'::jsonb, 'test', 'test', now(), now())
        """,
        UUID.randomUUID(),
        component,
        version);
    jdbc.update(
        """
        INSERT INTO relation_type
          (id, workspace_id, template_version_id, code, source_type, target_type, direction,
           cardinality, semantics, hierarchical, kind, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, 'contains', ?, ?, 'directed', 'many_to_many', 'strong',
           FALSE, 'domain', 'test', 'test', now(), now())
        """,
        link,
        workspace,
        version,
        component,
        component);
  }

  private ResponseEntity<Map> postMeta(
      UUID workspace, String type, String key, Map<String, Object> payload) {
    return post(workspace, "/meta-commands", envelope(workspace, type, key, payload));
  }

  private ResponseEntity<Map> postAssembly(
      UUID workspace, String key, Map<String, Object> payload) {
    return post(
        workspace, "/assembly-commands", envelope(workspace, "PlaceAssembly", key, payload));
  }

  private ResponseEntity<Map> get(UUID workspace, String path) {
    return http.exchange(
        base(workspace) + path,
        org.springframework.http.HttpMethod.GET,
        new HttpEntity<>(headers()),
        Map.class);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Map<String, Object> body) {
    return http.postForEntity(base(workspace) + path, new HttpEntity<>(body, headers()), Map.class);
  }

  private Map<String, Object> envelope(
      UUID workspace, String commandType, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("commandType", commandType);
    request.put("workspaceId", workspace.toString());
    request.put("correlationId", UUID.randomUUID().toString());
    request.put("idempotencyKey", key);
    request.put("payload", payload);
    return request;
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private int count(String table, UUID workspace) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM " + table + " WHERE workspace_id = ?", Integer.class, workspace);
  }

  private int commandCount(UUID workspace, String type) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM command_log WHERE workspace_id = ? AND command_type = ?",
        Integer.class,
        workspace,
        type);
  }

  private int placedEventCount(UUID workspace, String source) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM event_outbox
        WHERE payload->>'workspaceId' = ?
          AND payload->>'source' = ?
          AND payload->>'eventType' IN ('ObjectCreated', 'RelationCreated')
        """,
        Integer.class,
        workspace.toString(),
        source);
  }

  private List<String> fieldValues(String code) {
    return jdbc.queryForList(
        """
        SELECT value #>> '{}'
        FROM data_field_value value
        JOIN field_def field ON field.id = value.field_def_id
        WHERE field.code = ?
        ORDER BY value #>> '{}'
        """,
        String.class,
        code);
  }

  private HttpHeaders headers() {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", "reuse-user");
    return headers;
  }

  private String base(UUID workspace) {
    return "http://localhost:" + port + "/workspaces/" + workspace;
  }
}
