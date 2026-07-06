package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

/**
 * 回归 (v0.2 P0-1):在 InstantiateWorkspace 运行期实例化的工作空间里,依赖派生字段的 BLOCK 规则 R-TD-PWR 必须能触发。 复现:预算
 * 500W、单模块 5000W,total_power_fx=5000 &gt; 500,应产生一条 R-TD-PWR BLOCK 校核结果。
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"mnext.outbox.enabled=false", "mnext.readmodel.enabled=false"})
class InstantiatedWorkspaceBlockRuleE2EIntegrationTest {
  // 真实新建项目链路:命令信封/源空间 = ProfileLoader.AUTHOR_WORKSPACE(模板在此装载/授权)。
  private static final UUID AUTHOR = UUID.fromString("a0000000-0000-4000-8000-000000000000");
  private static final String ACTOR = "instantiated-block-rule-user";

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
  void overBudgetBlockRuleFiresInInstantiatedWorkspace() throws Exception {
    var manifest = technicalProposalManifest();
    loader.install(manifest, Actor.user(ACTOR));

    var template = templateId(manifest.templateCode());
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-over-budget")));

    var proposalType = objectType(workspace, "proposal");
    var moduleType = objectType(workspace, "module");
    var containsModuleType = relationType(workspace, "proposal_contains_module");

    // 复现网页"新建项目"向导:power_budget_w 在 CreateObject 时随根一起设(不是事后 UpdateFields)。
    var proposal =
        createObject(
            workspace,
            proposalType,
            "create-proposal",
            Map.of("title", "超预算方案", "version", "v1", "author", "arch", "power_budget_w", 500));
    // 复现"加模块"入口:CreateObject 预置 power_w=0,再由用户编辑改成 5000。
    var module =
        createObject(workspace, moduleType, "create-module", Map.of("name", "大功耗模块", "power_w", 0));

    applyEvents(
        command(
            workspace,
            createRelation(
                workspace, containsModuleType, proposal, module, "proposal-contains-module")));

    updateField(workspace, module, "set-module-power", "power_w", 5000);

    // 诊断:创建时设的 power_budget_w 是否进了读模型(rm_object)。
    var budget =
        jdbc.queryForObject(
            "SELECT fields->>'power_budget_w' FROM rm_object WHERE workspace_id = ? AND object_id = ?",
            String.class,
            workspace,
            proposal);
    assertEquals("500", budget, "power_budget_w 应随创建投影进 rm_object");

    // 派生字段必须能在实例化空间解析:total_power_fx = 5000。
    assertDecimal("5000", derivedEvaluator.evaluate(workspace, proposal, "total_power_fx"));

    var proposalRun =
        runId(rule(workspace, runRuleCheck(workspace, "proposal", "run-proposal-rules")));
    // 红线:5000 > 500 必须产出一条 R-TD-PWR BLOCK。
    assertEquals(1, countResults(workspace, proposalRun, "R-TD-PWR"));
    assertEquals("BLOCK", resultSeverity(workspace, proposalRun, "R-TD-PWR"));
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
            "Over Budget Proposal Project"));
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
}
