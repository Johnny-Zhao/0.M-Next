package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.events.EventEnvelope;
import com.mnext.server.plugin.ProfileManifest;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
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
class InteriorPluginInstallE2EIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final String ACTOR = "interior-plugin-user";

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

  @Autowired ProfileLoader loader;
  @Autowired ObjectMapper mapper;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestRestTemplate http;
  @Autowired DerivedEvaluator derivedEvaluator;
  @Autowired ReadModelProjection projection;
  @LocalServerPort int port;

  @Test
  void interiorPluginInstallsRunsAndRestoresThroughProfileLoader() throws Exception {
    var manifest = interiorManifest();
    loader.install(manifest, Actor.user(ACTOR));
    assertTrue(templateNames().contains("室内设计"));

    var template = templateId(manifest.templateCode());
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-interior")));

    var floorplanType = objectType(workspace, "floorplan");
    var roomType = objectType(workspace, "room");
    var containsType = relationType(workspace, "contains");
    var adjacentType = relationType(workspace, "adjacent");
    var floorplan =
        createObject(
            workspace, floorplanType, "create-floorplan", Map.of("name", "A1", "floor", 3));
    var darkRoom =
        createObject(
            workspace,
            roomType,
            "create-dark-room",
            roomFields("暗卧", "卧室", 4, 3, "N", 1, 1.5, 120, 17, 1.8, 0.6, 0.5));
    var hotRoom =
        createObject(
            workspace,
            roomType,
            "create-hot-room",
            roomFields("客厅", "客厅", 5, 4, "S", 4, 3, 320, 27, 1.2, 0.8, 1.2));
    applyEvents(
        command(
            workspace,
            createRelation(workspace, containsType, floorplan, darkRoom, "contains-dark")));
    applyEvents(
        command(
            workspace,
            createRelation(workspace, containsType, floorplan, hotRoom, "contains-hot")));
    applyEvents(
        command(
            workspace,
            createRelation(workspace, adjacentType, darkRoom, hotRoom, "adjacent-rooms")));

    assertDecimal("12", derivedEvaluator.evaluate(workspace, darkRoom, "area_fx"));
    assertDecimal(
        "0.08333333333333333333333333333333333",
        derivedEvaluator.evaluate(workspace, darkRoom, "window_floor_ratio_fx"));
    assertDecimal("20", derivedEvaluator.evaluate(workspace, hotRoom, "area_fx"));
    assertDecimal("32", derivedEvaluator.evaluate(workspace, floorplan, "total_area_fx"));

    var firstRun = runId(rule(workspace, runRuleCheck(workspace, "room", "run-interior-rules")));
    assertEquals(1, countResults(workspace, firstRun, "R-LIGHT-01"));
    assertEquals(1, countResults(workspace, firstRun, "R-LIGHT-02"));
    assertEquals(1, countResults(workspace, firstRun, "R-WIND-01"));
    assertEquals(1, countResults(workspace, firstRun, "R-THERMAL-LO"));
    assertEquals(1, countResults(workspace, firstRun, "R-THERMAL-HI"));
    assertEquals("BLOCK", ruleStatus(workspace, darkRoom));
    assertEquals("WARN", ruleStatus(workspace, hotRoom));

    applyEvents(
        command(
            workspace,
            updateFields(
                workspace,
                darkRoom,
                objectVersion(darkRoom),
                "resize-window",
                List.of(Map.of("fieldDefCode", "window_area_m2", "value", 2)))));
    assertDecimal(
        "0.1666666666666666666666666666666667",
        derivedEvaluator.evaluate(workspace, darkRoom, "window_floor_ratio_fx"));
    var secondRun =
        runId(rule(workspace, runRuleCheck(workspace, "room", "run-interior-after-window")));
    assertEquals(0, countResults(workspace, secondRun, "R-LIGHT-02"));

    loader.uninstall(manifest.templateCode(), Actor.user(ACTOR));
    assertFalse(templateNames().contains("室内设计"));
    var rejected = meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-withdrawn"));
    assertEquals(422, rejected.getStatusCode().value(), String.valueOf(rejected.getBody()));
    assertEquals("KERNEL-422-TEMPLATE-NOT-PUBLISHED", errorCode(rejected));

    createObject(
        workspace,
        roomType,
        "create-after-uninstall",
        roomFields("储藏间", "储藏", 2, 2, "E", 1, 3, 200, 22, 1.1, 0.3, 1.1));

    loader.install(manifest, Actor.user(ACTOR));
    assertTrue(templateNames().contains("室内设计"));
    assertOk(meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-after-restore")));
  }

  private ProfileManifest interiorManifest() throws Exception {
    var path =
        Path.of("..", "..", "packages", "domains", "interior-design", "profile.manifest.json")
            .normalize();
    if (!Files.exists(path)) {
      path = Path.of("packages", "domains", "interior-design", "profile.manifest.json");
    }
    assertTrue(Files.exists(path), "interior profile manifest must be readable without build copy");
    try (var input = Files.newInputStream(path)) {
      return mapper.readValue(input, ProfileManifest.class);
    }
  }

  private Map<String, Object> roomFields(
      String name,
      String usage,
      Number length,
      Number width,
      String orientation,
      Number windowArea,
      Number daylightFactor,
      Number illuminance,
      Number temperature,
      Number thermalU,
      Number thermalLoad,
      Number windAch) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("name", name);
    fields.put("usage", usage);
    fields.put("length_m", length);
    fields.put("width_m", width);
    fields.put("orientation", orientation);
    fields.put("window_area_m2", windowArea);
    fields.put("light_df", daylightFactor);
    fields.put("light_illuminance", illuminance);
    fields.put("thermal_temp", temperature);
    fields.put("thermal_u", thermalU);
    fields.put("thermal_load", thermalLoad);
    fields.put("wind_ach", windAch);
    return fields;
  }

  private Map<String, Object> instantiate(UUID template, UUID newWorkspace, String key) {
    return envelope(
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
            "Interior Project"));
  }

  private Map<String, Object> createObjectCommand(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    return envelope(
        "CreateObject",
        workspace,
        key,
        Map.of("objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
  }

  private Map<String, Object> createRelation(
      UUID workspace, UUID relationType, UUID source, UUID target, String key) {
    return envelope(
        "CreateRelation",
        workspace,
        key,
        Map.of(
            "relationTypeId", relationType,
            "sourceId", source,
            "targetId", target,
            "relationFields", Map.of(),
            "source", Map.of("type", "manual")));
  }

  private Map<String, Object> updateFields(
      UUID workspace, UUID objectId, long version, String key, List<Map<String, Object>> fields) {
    return envelope(
        "UpdateFields",
        workspace,
        key,
        Map.of("objectId", objectId, "expectedObjectVersion", version, "fields", fields));
  }

  private Map<String, Object> runRuleCheck(UUID workspace, String objectTypeCode, String key) {
    return envelope(
        "RunRuleCheck", workspace, key, Map.of("scope", Map.of("objectTypeCode", objectTypeCode)));
  }

  private Map<String, Object> envelope(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", workspace);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", key);
    request.put("commandType", type);
    request.put("payload", payload);
    return request;
  }

  private UUID createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    var response = command(workspace, createObjectCommand(workspace, objectType, key, fields));
    assertOk(response);
    applyEvents(response);
    return createdObjectId(response.getBody());
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> command(UUID workspace, Object request) {
    return post(workspace, "/commands", request);
  }

  private ResponseEntity<Map> rule(UUID workspace, Object request) {
    return post(workspace, "/rule-commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", ACTOR);
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + workspace + path,
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private String runId(ResponseEntity<Map> response) {
    assertOk(response);
    return (String) ((List<?>) response.getBody().get("events")).getFirst();
  }

  private UUID createdObjectId(Map<?, ?> body) {
    for (var eventId : (List<?>) body.get("events")) {
      var objectId =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (objectId != null) return UUID.fromString(objectId);
    }
    throw new IllegalStateException("CreateObject did not emit ObjectCreated");
  }

  private void applyEvents(ResponseEntity<Map> response) {
    assertOk(response);
    for (var eventId : (List<?>) response.getBody().get("events")) {
      var payload =
          jdbc.query(
              "SELECT payload::text FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (payload != null) {
        try {
          projection.apply(mapper.readValue(payload, EventEnvelope.class));
        } catch (Exception failure) {
          throw new IllegalStateException("read model projection failed", failure);
        }
      }
    }
  }

  private void assertDecimal(String expected, Object actual) {
    assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) actual));
  }

  private List<String> templateNames() {
    var response =
        http.getForEntity("http://localhost:" + port + "/views/templates", List.class).getBody();
    return response.stream().map(item -> (String) ((Map<?, ?>) item).get("name")).toList();
  }

  private UUID templateId(String code) {
    return jdbc.queryForObject("SELECT id FROM scene_template WHERE code = ?", UUID.class, code);
  }

  private UUID objectType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private UUID relationType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private long objectVersion(UUID objectId) {
    return jdbc.queryForObject(
        "SELECT version FROM data_object WHERE id = ?", Long.class, objectId);
  }

  private int countResults(UUID workspace, String runId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM check_result
        WHERE workspace_id = ? AND run_id = ?::uuid AND rule_code = ?
        """,
        Integer.class,
        workspace,
        runId,
        ruleCode);
  }

  private String ruleStatus(UUID workspace, UUID objectId) {
    var response =
        http.getForEntity(
            "http://localhost:"
                + port
                + "/workspaces/"
                + workspace
                + "/views/rule-status?objectIds="
                + objectId,
            List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (String) ((Map<?, ?>) response.getBody().getFirst()).get("ruleStatus");
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }
}
