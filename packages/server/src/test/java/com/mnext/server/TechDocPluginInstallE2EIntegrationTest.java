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
class TechDocPluginInstallE2EIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final String ACTOR = "techdoc-plugin-user";

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
  void technicalProposalPluginInstallsRunsAndRestoresThroughProfileLoader() throws Exception {
    var manifest = technicalProposalManifest();
    loader.install(manifest, Actor.user(ACTOR));
    assertTrue(templateNames().contains("技术方案"));

    var template = templateId(manifest.templateCode());
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-techdoc")));

    var proposalType = objectType(workspace, "proposal");
    var systemType = objectType(workspace, "system");
    var moduleType = objectType(workspace, "module");
    var interfaceType = objectType(workspace, "interface");
    var requirementType = objectType(workspace, "requirement");
    var containsSystemType = relationType(workspace, "proposal_contains_system");
    var containsModuleType = relationType(workspace, "proposal_contains_module");
    var interfacesWithType = relationType(workspace, "proposal_interfaces_with");
    var satisfiesType = relationType(workspace, "proposal_satisfies");

    var proposal =
        createObject(
            workspace,
            proposalType,
            "create-proposal",
            Map.of("title", "调度平台技术方案", "version", "v1", "author", "arch"));
    var system =
        createObject(
            workspace,
            systemType,
            "create-system",
            Map.of("name", "协作平台", "responsibility", "承载技术方案协作"));
    var parentModule =
        createObject(
            workspace,
            moduleType,
            "create-parent-module",
            moduleFields("方案编排", "组织章节、模型与导出任务", "核心编排模块"));
    var missingResponsibilityModule =
        createObject(
            workspace,
            moduleType,
            "create-missing-responsibility-module",
            Map.of("name", "未定职责模块", "description", "用于触发规则灯"));
    var incompleteInterface =
        createObject(
            workspace,
            interfaceType,
            "create-incomplete-interface",
            Map.of("name", "文档生成接口", "direction", "out", "protocol", ""));
    var coveredRequirement =
        createObject(
            workspace,
            requirementType,
            "create-covered-requirement",
            requirementFields("REQ-1", "模块必须生成技术方案章节", "HIGH"));
    var uncoveredRequirement =
        createObject(
            workspace,
            requirementType,
            "create-uncovered-requirement",
            requirementFields("REQ-2", "接口必须声明协议和数据", "MEDIUM"));

    applyEvents(
        command(
            workspace,
            createRelation(workspace, containsSystemType, proposal, system, "contains-system")));
    applyEvents(
        command(
            workspace,
            createRelation(
                workspace,
                containsModuleType,
                proposal,
                parentModule,
                "proposal-contains-parent-module")));
    applyEvents(
        command(
            workspace,
            createRelation(
                workspace,
                containsModuleType,
                parentModule,
                missingResponsibilityModule,
                "contains-child-module")));
    applyEvents(
        command(
            workspace,
            createRelation(
                workspace,
                interfacesWithType,
                parentModule,
                incompleteInterface,
                "module-interface")));
    applyEvents(
        command(
            workspace,
            createRelation(
                workspace, satisfiesType, parentModule, coveredRequirement, "module-satisfies")));

    updateField(workspace, proposal, "set-proposal-budget", "power_budget_w", 300);
    updateField(workspace, parentModule, "set-parent-power", "power_w", 180);
    updateField(workspace, missingResponsibilityModule, "set-child-power", "power_w", 150);

    assertDecimal("1", derivedEvaluator.evaluate(workspace, parentModule, "child_count_fx"));
    assertDecimal("330", derivedEvaluator.evaluate(workspace, proposal, "total_power_fx"));

    var proposalRun =
        runId(rule(workspace, runRuleCheck(workspace, "proposal", "run-proposal-rules")));
    assertEquals(1, countResults(workspace, proposalRun, "R-TD-PWR"));
    assertEquals("BLOCK", resultSeverity(workspace, proposalRun, "R-TD-PWR"));

    var moduleRun = runId(rule(workspace, runRuleCheck(workspace, "module", "run-module-rules")));
    assertEquals(1, countResults(workspace, moduleRun, "R-TD-RESP"));
    assertEquals("WARN", ruleStatus(workspace, missingResponsibilityModule));

    var interfaceRun =
        runId(rule(workspace, runRuleCheck(workspace, "interface", "run-interface-rules")));
    assertEquals(1, countResults(workspace, interfaceRun, "R-TD-IF"));
    assertEquals("WARN", ruleStatus(workspace, incompleteInterface));

    var requirementRun =
        runId(rule(workspace, runRuleCheck(workspace, "requirement", "run-requirement-rules")));
    assertEquals(1, countResults(workspace, requirementRun, "R-TD-COV"));
    assertEquals("WARN", ruleStatus(workspace, uncoveredRequirement));
    assertEquals("OK", ruleStatus(workspace, coveredRequirement));

    updateField(workspace, missingResponsibilityModule, "reduce-child-power", "power_w", 100);
    assertDecimal("280", derivedEvaluator.evaluate(workspace, proposal, "total_power_fx"));
    var fixedProposalRun =
        runId(rule(workspace, runRuleCheck(workspace, "proposal", "run-proposal-fixed")));
    assertEquals(0, countResults(workspace, fixedProposalRun, "R-TD-PWR"));

    loader.uninstall(manifest.templateCode(), Actor.user(ACTOR));
    assertFalse(templateNames().contains("技术方案"));

    var rejected = meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-withdrawn"));
    assertEquals(422, rejected.getStatusCode().value(), String.valueOf(rejected.getBody()));
    assertEquals("KERNEL-422-TEMPLATE-NOT-PUBLISHED", errorCode(rejected));

    createObject(
        workspace,
        moduleType,
        "create-after-uninstall",
        moduleFields("卸载后模块", "证明旧工作空间仍可用", "卸载不破坏已有项目"));

    loader.install(manifest, Actor.user(ACTOR));
    assertTrue(templateNames().contains("技术方案"));
    assertOk(meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-after-restore")));
  }

  private ProfileManifest technicalProposalManifest() throws Exception {
    var path =
        Path.of("..", "..", "packages", "domains", "technical-proposal", "profile.manifest.json")
            .normalize();
    if (!Files.exists(path)) {
      path = Path.of("packages", "domains", "technical-proposal", "profile.manifest.json");
    }
    assertTrue(
        Files.exists(path),
        "technical proposal profile manifest must be readable without build copy");
    try (var input = Files.newInputStream(path)) {
      return mapper.readValue(input, ProfileManifest.class);
    }
  }

  private Map<String, Object> moduleFields(String name, String responsibility, String description) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("name", name);
    fields.put("responsibility", responsibility);
    fields.put("description", description);
    return fields;
  }

  private Map<String, Object> requirementFields(String code, String text, String priority) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("code", code);
    fields.put("text", text);
    fields.put("priority", priority);
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
            "Technical Proposal Project"));
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

  private void updateField(
      UUID workspace, UUID objectId, String key, String fieldCode, Object value) {
    applyEvents(
        command(
            workspace,
            updateFields(
                workspace,
                objectId,
                objectVersion(objectId),
                key,
                List.of(Map.of("fieldDefCode", fieldCode, "value", value)))));
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
    assertEquals(0, new BigDecimal(expected).compareTo(new BigDecimal(String.valueOf(actual))));
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

  private long objectVersion(UUID objectId) {
    return jdbc.queryForObject(
        "SELECT version FROM data_object WHERE id = ?", Long.class, objectId);
  }

  private String resultSeverity(UUID workspace, String runId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT severity
        FROM check_result
        WHERE workspace_id = ? AND run_id = ?::uuid AND rule_code = ?
        """,
        String.class,
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
