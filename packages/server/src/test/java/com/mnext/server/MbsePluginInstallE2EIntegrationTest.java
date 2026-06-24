package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.events.EventEnvelope;
import com.mnext.server.plugin.ProfileManifest;
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
class MbsePluginInstallE2EIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final String ACTOR = "mbse-plugin-user";

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
  void mbseProfileInstallsChecksVerificationLoopAndRestores() throws Exception {
    var manifest = mbseManifest();
    loader.install(manifest, Actor.user(ACTOR));
    assertTrue(templateNames().contains("MBSE / 验证"));

    var template = templateId(manifest.templateCode());
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-mbse")));

    var types = loadTypes(workspace);
    var relations = loadRelations(workspace);
    var mission =
        createObject(
            workspace, types.get("mission"), "create-mission", fields("name", "Lunar SAR"));
    var phase =
        createObject(workspace, types.get("phase"), "create-phase", fields("name", "Entry"));
    var coveredEnv =
        createObject(
            workspace,
            types.get("env_condition"),
            "create-covered-env",
            fields("name", "Thermal", "value", "hot"));
    var uncoveredEnv =
        createObject(
            workspace,
            types.get("env_condition"),
            "create-uncovered-env",
            fields("name", "Radiation", "value", "TID"));
    var uncoveredCapability =
        createObject(
            workspace,
            types.get("capability"),
            "create-uncovered-capability",
            fields("name", "Radiation tolerance"));
    var failCapability =
        createObject(
            workspace,
            types.get("capability"),
            "create-fail-capability",
            fields("name", "Thermal survival"));
    var warnCapability =
        createObject(
            workspace,
            types.get("capability"),
            "create-warn-capability",
            fields("name", "Startup monitoring"));
    var passCapability =
        createObject(
            workspace,
            types.get("capability"),
            "create-pass-capability",
            fields("name", "Link acquisition"));

    var failRequirement =
        createObject(
            workspace,
            types.get("requirement"),
            "create-fail-requirement",
            requirementFields("REQ-THERM-01", "Survive hot case", "65C", 0.2));
    var warnRequirement =
        createObject(
            workspace,
            types.get("requirement"),
            "create-warn-requirement",
            requirementFields("REQ-BOOT-01", "Report startup", "5s", 0.1));
    var passRequirement =
        createObject(
            workspace,
            types.get("requirement"),
            "create-pass-requirement",
            requirementFields("REQ-LINK-01", "Acquire link", "3 min", 0.15));
    var failTest =
        createObject(
            workspace, types.get("test_case"), "create-fail-test", fields("name", "Thermal TVAC"));
    var passTest =
        createObject(
            workspace, types.get("test_case"), "create-pass-test", fields("name", "RF lock"));
    var failResult =
        createObject(
            workspace,
            types.get("test_result"),
            "create-fail-result",
            fields("value", 72, "verdict", "fail"));
    var passResult =
        createObject(
            workspace,
            types.get("test_result"),
            "create-pass-result",
            fields("value", 2, "verdict", "pass"));

    link(workspace, relations.get("occurs_in"), phase, mission, "phase-occurs");
    link(workspace, relations.get("imposes"), phase, coveredEnv, "phase-imposes-covered");
    link(workspace, relations.get("imposes"), phase, uncoveredEnv, "phase-imposes-uncovered");
    link(
        workspace,
        relations.get("requires"),
        uncoveredEnv,
        uncoveredCapability,
        "env-requires-uncovered");
    link(workspace, relations.get("requires"), coveredEnv, failCapability, "env-requires-fail");
    link(workspace, relations.get("requires"), coveredEnv, warnCapability, "env-requires-warn");
    link(workspace, relations.get("requires"), coveredEnv, passCapability, "env-requires-pass");
    link(workspace, relations.get("derives"), failCapability, failRequirement, "cap-derives-fail");
    link(workspace, relations.get("derives"), warnCapability, warnRequirement, "cap-derives-warn");
    link(workspace, relations.get("derives"), passCapability, passRequirement, "cap-derives-pass");
    link(workspace, relations.get("verified_by"), failRequirement, failTest, "fail-verified-by");
    link(workspace, relations.get("verified_by"), passRequirement, passTest, "pass-verified-by");
    link(workspace, relations.get("produces"), failTest, failResult, "fail-test-produces");
    link(workspace, relations.get("produces"), passTest, passResult, "pass-test-produces");

    assertEquals("fail", derivedEvaluator.evaluate(workspace, failRequirement, "verify_status_fx"));
    assertEquals(
        "unverified", derivedEvaluator.evaluate(workspace, warnRequirement, "verify_status_fx"));
    assertEquals("pass", derivedEvaluator.evaluate(workspace, passRequirement, "verify_status_fx"));

    var envRun = runId(rule(workspace, runRuleCheck(workspace, "env_condition", "run-env-rules")));
    assertEquals(1, countResults(workspace, envRun, "R-COV-01"));
    assertEquals("BLOCK", ruleStatus(workspace, uncoveredEnv));

    var requirementRun =
        runId(rule(workspace, runRuleCheck(workspace, "requirement", "run-requirement-rules")));
    assertEquals(1, countResults(workspace, requirementRun, "R-VER-01"));
    assertEquals(1, countResults(workspace, requirementRun, "R-VER-02"));
    assertEquals("WARN", ruleStatus(workspace, warnRequirement));
    assertEquals("BLOCK", ruleStatus(workspace, failRequirement));

    loader.uninstall(manifest.templateCode(), Actor.user(ACTOR));
    assertFalse(templateNames().contains("MBSE / 验证"));
    var rejected = meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-withdrawn"));
    assertEquals(422, rejected.getStatusCode().value(), String.valueOf(rejected.getBody()));
    assertEquals("KERNEL-422-TEMPLATE-NOT-PUBLISHED", errorCode(rejected));

    loader.install(manifest, Actor.user(ACTOR));
    assertTrue(templateNames().contains("MBSE / 验证"));
    assertOk(meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-after-restore")));
  }

  private ProfileManifest mbseManifest() throws Exception {
    var path =
        Path.of("..", "..", "packages", "domains", "mbse", "profile.manifest.json").normalize();
    if (!Files.exists(path)) {
      path = Path.of("packages", "domains", "mbse", "profile.manifest.json");
    }
    assertTrue(Files.exists(path), "MBSE profile manifest must be readable without build copy");
    try (var input = Files.newInputStream(path)) {
      return mapper.readValue(input, ProfileManifest.class);
    }
  }

  private Map<String, UUID> loadTypes(UUID workspace) {
    var result = new LinkedHashMap<String, UUID>();
    for (var code :
        List.of(
            "mission",
            "phase",
            "env_condition",
            "capability",
            "requirement",
            "test_case",
            "test_result")) {
      result.put(code, objectType(workspace, code));
    }
    return result;
  }

  private Map<String, UUID> loadRelations(UUID workspace) {
    var result = new LinkedHashMap<String, UUID>();
    for (var code :
        List.of("occurs_in", "imposes", "requires", "derives", "verified_by", "produces")) {
      result.put(code, relationType(workspace, code));
    }
    return result;
  }

  private Map<String, Object> requirementFields(
      String code, String text, String target, Number marginThreshold) {
    return fields(
        "code", code, "text", text, "target", target, "margin_threshold", marginThreshold);
  }

  private Map<String, Object> fields(Object... entries) {
    var result = new LinkedHashMap<String, Object>();
    for (var index = 0; index < entries.length; index += 2) {
      result.put((String) entries[index], entries[index + 1]);
    }
    return result;
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
            "MBSE Verification Project"));
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

  private void link(UUID workspace, UUID relationType, UUID source, UUID target, String key) {
    applyEvents(command(workspace, createRelation(workspace, relationType, source, target, key)));
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
