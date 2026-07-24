package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.CommandRejectedException;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
class ExpressionConfigIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("81818181-8181-4181-8181-818181818181");
  private static final UUID OTHER = UUID.fromString("82828282-8282-4282-8282-828282828282");

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
  @Autowired ObjectMapper mapper;
  @Autowired ExpressionConfigService service;
  @LocalServerPort int port;

  @BeforeEach
  void reset() {
    jdbc.execute("TRUNCATE TABLE workspace_view_config, workspace_expression_config");
    jdbc.update("DELETE FROM workspace_member WHERE workspace_id IN (?, ?)", WORKSPACE, OTHER);
    jdbc.update("DELETE FROM workspace WHERE id IN (?, ?)", WORKSPACE, OTHER);
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, 'Expression A', 'ACTIVE')", WORKSPACE);
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, 'Expression B', 'ACTIVE')", OTHER);
  }

  @Test
  void createsAndListsExpressionWithInitialViewInOneCatalogResponse() {
    var response = post(WORKSPACE, request("采购列表", "grid", gridConfig()), "server-actor");

    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    var created = response.getBody();
    assertEquals("采购列表", created.get("name"));
    assertEquals("server-actor", created.get("createdBy"));
    assertTrue(String.valueOf(created.get("expressionId")).startsWith("user-exp-"));
    var views = castList(created.get("views"));
    assertEquals(1, views.size());
    assertEquals(created.get("defaultViewId"), views.getFirst().get("viewId"));
    assertEquals("server-actor", views.getFirst().get("createdBy"));

    var listed = get(WORKSPACE, "server-actor");
    assertEquals(1, listed.size());
    assertEquals(created.get("expressionId"), listed.getFirst().get("expressionId"));
    assertEquals(0, count("event_outbox"));
    assertEquals(0, count("data_object"));
    assertEquals(0, count("data_relation"));
  }

  @Test
  void rejectsDuplicateNamesOnlyInsideTheSameWorkspace() {
    assertEquals(
        200,
        post(WORKSPACE, request("  My Grid  ", "grid", gridConfig()), "a").getStatusCode().value());

    var duplicate = post(WORKSPACE, request("my grid", "grid", gridConfig()), "a");
    assertEquals(409, duplicate.getStatusCode().value());
    assertEquals("KERNEL-409-DUPLICATE-VALUE", error(duplicate).get("code"));
    assertEquals(
        200, post(OTHER, request("MY GRID", "grid", gridConfig()), "b").getStatusCode().value());
  }

  @Test
  void rejectsInvalidKindsMismatchedFormsAndInvalidConfigs() {
    assertInvalid(request("Bad kind", "unknown", gridConfig()));
    assertInvalid(
        Map.of(
            "name", "Mismatch",
            "space", "main",
            "defaultForm", "bi",
            "view", Map.of("kind", "grid", "config", gridConfig())));
    assertInvalid(request("Bad config", "grid", Map.of("columns", List.of("name"))));
    assertEquals(0, count("workspace_expression_config"));
    assertEquals(0, count("workspace_view_config"));
  }

  @Test
  void rollsBackExpressionWhenInitialViewInsertFails() {
    var first =
        service.createWithIds(
            OTHER,
            "actor-b",
            dto("Existing", "grid", gridConfig()),
            "user-exp-existing",
            "user-view-collision");
    assertEquals("user-view-collision", first.defaultViewId());

    assertThrows(
        CommandRejectedException.class,
        () ->
            service.createWithIds(
                WORKSPACE,
                "actor-a",
                dto("Must Roll Back", "grid", gridConfig()),
                "user-exp-rollback",
                "user-view-collision"));
    assertEquals(
        0,
        jdbc.queryForObject(
            "SELECT count(*) FROM workspace_expression_config WHERE expression_id = ?",
            Integer.class,
            "user-exp-rollback"));
  }

  @Test
  void listIsWorkspaceScoped() {
    post(WORKSPACE, request("Workspace A", "grid", gridConfig()), "a");
    post(OTHER, request("Workspace B", "grid", gridConfig()), "b");

    assertEquals(List.of("Workspace A"), names(get(WORKSPACE, "a")));
    assertEquals(List.of("Workspace B"), names(get(OTHER, "b")));
  }

  private void assertInvalid(Map<String, Object> body) {
    var response = post(WORKSPACE, body, "actor");
    assertEquals(400, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("KERNEL-400-SCHEMA-INVALID", error(response).get("code"));
  }

  private ResponseEntity<Map> post(UUID workspaceId, Map<String, Object> body, String actor) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", actor);
    return http.postForEntity(base(workspaceId), new HttpEntity<>(body, headers), Map.class);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> get(UUID workspaceId, String actor) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", actor);
    var response =
        http.exchange(
            base(workspaceId),
            org.springframework.http.HttpMethod.GET,
            new HttpEntity<>(headers),
            List.class);
    assertEquals(200, response.getStatusCode().value());
    return (List<Map<String, Object>>) response.getBody();
  }

  private ExpressionConfigCreateRequest dto(String name, String kind, Map<String, Object> config) {
    return new ExpressionConfigCreateRequest(
        name, "main", kind, new ExpressionViewCreateRequest(kind, mapper.valueToTree(config)));
  }

  private static Map<String, Object> request(String name, String kind, Map<String, Object> config) {
    return Map.of(
        "name",
        name,
        "space",
        "main",
        "defaultForm",
        kind,
        "view",
        Map.of("kind", kind, "config", config));
  }

  private static Map<String, Object> gridConfig() {
    return Map.of(
        "objectTypeCode", "build_plan",
        "columns", List.of("code", "name"),
        "defaultSort", Map.of("fieldCode", "code", "direction", "asc"));
  }

  private static List<String> names(List<Map<String, Object>> configs) {
    return configs.stream().map(item -> String.valueOf(item.get("name"))).toList();
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> castList(Object value) {
    return (List<Map<String, Object>>) value;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> error(ResponseEntity<Map> response) {
    return (Map<String, Object>) response.getBody().get("error");
  }

  private int count(String table) {
    assertTrue(
        Set.of(
                "event_outbox",
                "data_object",
                "data_relation",
                "workspace_expression_config",
                "workspace_view_config")
            .contains(table));
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private String base(UUID workspaceId) {
    return "http://localhost:" + port + "/workspaces/" + workspaceId + "/expression-configs";
  }
}
