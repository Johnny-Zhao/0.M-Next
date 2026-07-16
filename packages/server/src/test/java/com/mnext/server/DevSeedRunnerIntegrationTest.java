package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@ActiveProfiles("dev")
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"mnext.outbox.enabled=false"})
class DevSeedRunnerIntegrationTest {
  private static final UUID INTERIOR_WORKSPACE =
      UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID TECHNICAL_WORKSPACE =
      UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final UUID MBSE_WORKSPACE =
      UUID.fromString("33333333-3333-4333-8333-333333333333");
  private static final UUID HARDWARE_WORKSPACE =
      UUID.fromString("44444444-4444-4444-8444-444444444444");
  private static final UUID PC_PROCUREMENT_WORKSPACE = PcProcurementDevSeeder.WORKSPACE_ID;
  private static final Set<String> PC_PROCUREMENT_TYPES =
      Set.of(
          "procurement_requirement",
          "hardware_product",
          "supplier",
          "supplier_quote",
          "build_plan",
          "build_plan_item");
  private static final Map<String, Set<String>> HARDWARE_FIELDS =
      Map.of(
          "product_specs",
          Set.of(
              "sku",
              "name",
              "price",
              "owner",
              "battery_months",
              "rating",
              "launch_date",
              "lifecycle"),
          "hardware_products",
          Set.of("name", "part_type", "chipset", "form_factor", "socket", "vrm", "price", "cores"),
          "channel_sales",
          Set.of("channel", "month_sales", "cached_price"),
          "contracts",
          Set.of("name", "product", "channel", "quote", "contact", "amount"),
          "customers",
          Set.of("name", "region"));

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

  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;
  @Autowired TestRestTemplate http;
  @Autowired DerivedEvaluator derivedEvaluator;
  @Autowired RuleCheckRunner ruleChecks;
  @Autowired DevSeedRunner runner;
  @Autowired PcProcurementDevSeeder pcProcurementSeeder;
  @Autowired SnapshotRepository snapshots;
  @LocalServerPort int port;

  @Test
  void devSeedInstallsInteriorTechnicalProposalMbseAndHardwareDemos() {
    assertEquals(1, objectCount(INTERIOR_WORKSPACE, "floorplan"));
    assertEquals(6, objectCount(INTERIOR_WORKSPACE, "room"));

    assertEquals(1, objectCount(TECHNICAL_WORKSPACE, "proposal"));
    assertEquals(2, objectCount(TECHNICAL_WORKSPACE, "system"));
    assertEquals(6, objectCount(TECHNICAL_WORKSPACE, "module"));
    assertEquals(3, objectCount(TECHNICAL_WORKSPACE, "alternative"));
    assertEquals(2, objectCount(TECHNICAL_WORKSPACE, "interface"));
    assertEquals(2, objectCount(TECHNICAL_WORKSPACE, "requirement"));
    assertEquals(6, readModelCount(TECHNICAL_WORKSPACE, "module"));
    assertEquals(3, readModelCount(TECHNICAL_WORKSPACE, "alternative"));

    var proposal = firstObjectId(TECHNICAL_WORKSPACE, "proposal");
    assertDecimal(
        "840", derivedEvaluator.evaluate(TECHNICAL_WORKSPACE, proposal, "total_power_fx"));
    var powerSubsystem = objectIdByField(TECHNICAL_WORKSPACE, "module", "name", "电源分系统");
    assertDecimal(
        "2", derivedEvaluator.evaluate(TECHNICAL_WORKSPACE, powerSubsystem, "child_count_fx"));

    assertEquals(1, checkResultCount(TECHNICAL_WORKSPACE, "R-TD-PWR"));
    assertEquals(1, checkResultCount(TECHNICAL_WORKSPACE, "R-TD-RESP"));
    assertEquals(1, checkResultCount(TECHNICAL_WORKSPACE, "R-TD-IF"));
    assertEquals(1, checkResultCount(TECHNICAL_WORKSPACE, "R-TD-COV"));

    assertEquals(1, objectCount(MBSE_WORKSPACE, "mission"));
    assertEquals(1, objectCount(MBSE_WORKSPACE, "mission_context"));
    assertEquals(3, objectCount(MBSE_WORKSPACE, "phase"));
    assertEquals(3, objectCount(MBSE_WORKSPACE, "env_condition"));
    assertEquals(4, objectCount(MBSE_WORKSPACE, "capability"));
    assertEquals(14, objectCount(MBSE_WORKSPACE, "requirement"));
    assertEquals(11, objectCount(MBSE_WORKSPACE, "test_case"));
    assertEquals(9, objectCount(MBSE_WORKSPACE, "test_result"));
    assertEquals(14, readModelCount(MBSE_WORKSPACE, "requirement"));

    var navigation = objectIdByField(MBSE_WORKSPACE, "capability", "name", "自主导航");
    assertDecimal(
        "4", derivedEvaluator.evaluate(MBSE_WORKSPACE, navigation, "requirement_count_fx"));
    var passRequirement = objectIdByField(MBSE_WORKSPACE, "requirement", "code", "REQ-MBSE-001");
    var failedRequirement = objectIdByField(MBSE_WORKSPACE, "requirement", "code", "REQ-MBSE-002");
    var unverifiedRequirement =
        objectIdByField(MBSE_WORKSPACE, "requirement", "code", "REQ-MBSE-003");
    var uncoveredRequirement =
        objectIdByField(MBSE_WORKSPACE, "requirement", "code", "REQ-MBSE-004");
    var marginFailedRequirement =
        objectIdByField(MBSE_WORKSPACE, "requirement", "code", "REQ-MBSE-006");
    assertEquals(
        "pass", derivedEvaluator.evaluate(MBSE_WORKSPACE, passRequirement, "verify_status_fx"));
    assertEquals(
        "fail", derivedEvaluator.evaluate(MBSE_WORKSPACE, failedRequirement, "verify_status_fx"));
    assertEquals(
        "unverified",
        derivedEvaluator.evaluate(MBSE_WORKSPACE, unverifiedRequirement, "verify_status_fx"));
    assertEquals(
        "unverified",
        derivedEvaluator.evaluate(MBSE_WORKSPACE, uncoveredRequirement, "verify_status_fx"));
    assertDecimal(
        "1", derivedEvaluator.evaluate(MBSE_WORKSPACE, passRequirement, "verify_result_count_fx"));
    assertEquals(
        true, derivedEvaluator.evaluate(MBSE_WORKSPACE, passRequirement, "verify_margin_ok_fx"));
    assertEquals(
        false,
        derivedEvaluator.evaluate(MBSE_WORKSPACE, marginFailedRequirement, "verify_margin_ok_fx"));

    assertEquals(3, checkResultCount(MBSE_WORKSPACE, "R-VER-01"));
    assertEquals(4, checkResultCount(MBSE_WORKSPACE, "R-VER-02"));
    assertEquals(5, checkResultCount(MBSE_WORKSPACE, "R-VER-03"));
    assertEquals(3, checkResultCount(MBSE_WORKSPACE, "R-VER-04"));

    var coverage =
        http.getForEntity(
                base()
                    + "/workspaces/"
                    + MBSE_WORKSPACE
                    + "/views/verification-coverage?page=0&size=20",
                Map.class)
            .getBody();
    assertEquals(5, ((Number) coverage.get("verified")).intValue());
    assertEquals(5, ((Number) coverage.get("unverified")).intValue());
    assertEquals(4, ((Number) coverage.get("failed")).intValue());
    assertEquals(14, ((Number) coverage.get("total")).intValue());
    var gaps = (Map<?, ?>) coverage.get("gaps");
    assertEquals(9, ((Number) gaps.get("total")).intValue());

    assertEquals(4, objectCount(MBSE_WORKSPACE, "sysml_requirement"));
    assertEquals(4, readModelCount(MBSE_WORKSPACE, "sysml_requirement"));
    assertEquals(3, relationCount(MBSE_WORKSPACE, "sysml_requirement_to_mbse_requirement"));
    assertEquals(3, workspaceProfileCount(MBSE_WORKSPACE));

    var mappings =
        Arrays.stream(
                http.getForEntity(
                        base() + "/workspaces/" + MBSE_WORKSPACE + "/views/mapping/correspondences",
                        Map[].class)
                    .getBody())
            .toList();
    assertEquals(1, mappings.size(), mappings.toString());
    var mapping = mappings.getFirst();
    assertEquals("sysml_requirement_to_mbse_requirement", mapping.get("relationType"));
    assertEquals("sysml", mapping.get("sourceProfile"));
    assertEquals("mbse_verification", mapping.get("targetProfile"));
    assertEquals("sysml_requirement", mapping.get("sourceTypeCode"));
    assertEquals("requirement", mapping.get("targetTypeCode"));
    assertMappingCoverage(UUID.fromString(String.valueOf(mapping.get("correspondenceId"))));

    var workspaces =
        Arrays.stream(http.getForEntity(base() + "/views/workspaces", Map[].class).getBody())
            .toList();
    var workspaceIds =
        workspaces.stream().map(row -> String.valueOf(row.get("workspaceId"))).toList();
    var names = workspaces.stream().map(row -> String.valueOf(row.get("name"))).toList();
    assertFalse(
        workspaceIds.contains(ProfileLoader.AUTHOR_WORKSPACE.toString()), workspaces.toString());
    assertTrue(workspaceIds.contains(INTERIOR_WORKSPACE.toString()), workspaces.toString());
    assertTrue(workspaceIds.contains(TECHNICAL_WORKSPACE.toString()), workspaces.toString());
    assertTrue(workspaceIds.contains(MBSE_WORKSPACE.toString()), workspaces.toString());
    assertTrue(workspaceIds.contains(HARDWARE_WORKSPACE.toString()), workspaces.toString());
    assertTrue(names.contains("室内设计 Demo"), names.toString());
    assertTrue(names.contains("技术方案 Demo"), names.toString());
    assertTrue(names.contains("MBSE Demo"), names.toString());
    assertTrue(names.contains("门锁 Demo"), names.toString());

    assertEquals(1, templateObjectTypeCount(ProfileLoader.AUTHOR_WORKSPACE, "room"));
    assertEquals(1, runtimeObjectTypeCount(INTERIOR_WORKSPACE, "room"));
  }

  @Test
  void devSeedInstallsEmptyHardwareDemoWithAllSeedTypes() {
    assertEquals(0, objectCount(HARDWARE_WORKSPACE, "product_specs"));
    assertEquals(HARDWARE_FIELDS.keySet(), runtimeObjectTypeCodes(HARDWARE_WORKSPACE));
    HARDWARE_FIELDS.forEach(
        (objectTypeCode, fields) ->
            assertEquals(fields, fieldCodes(HARDWARE_WORKSPACE, objectTypeCode)));
    assertEquals(1, runtimeRelationTypeCount(HARDWARE_WORKSPACE, "interconnects_with"));

    var response =
        http.getForEntity(
            base() + "/workspaces/" + HARDWARE_WORKSPACE + "/views/object-types", Map[].class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    var returnedCodes =
        Arrays.stream(response.getBody())
            .map(type -> String.valueOf(type.get("code")))
            .collect(java.util.stream.Collectors.toSet());
    assertEquals(HARDWARE_FIELDS.keySet(), returnedCodes);
    Arrays.stream(response.getBody())
        .forEach(
            type -> {
              @SuppressWarnings("unchecked")
              var fields = (List<Map<String, Object>>) type.get("fields");
              var returnedFields =
                  fields.stream()
                      .map(field -> String.valueOf(field.get("code")))
                      .collect(java.util.stream.Collectors.toSet());
              assertEquals(HARDWARE_FIELDS.get(String.valueOf(type.get("code"))), returnedFields);
            });
  }

  @Test
  void pcProcurementProfileAndSeedAreInstalled() {
    assertEquals(PC_PROCUREMENT_TYPES, runtimeObjectTypeCodes(PC_PROCUREMENT_WORKSPACE));
    assertTrue(enumFieldAllows(PC_PROCUREMENT_WORKSPACE, "hardware_product", "category", "CASE"));
    assertEquals(1, objectCount(PC_PROCUREMENT_WORKSPACE, "procurement_requirement"));
    assertEquals(14, objectCount(PC_PROCUREMENT_WORKSPACE, "hardware_product"));
    assertEquals(3, objectCount(PC_PROCUREMENT_WORKSPACE, "supplier"));
    assertEquals(12, objectCount(PC_PROCUREMENT_WORKSPACE, "supplier_quote"));
    assertEquals(2, objectCount(PC_PROCUREMENT_WORKSPACE, "build_plan"));
    assertEquals(14, objectCount(PC_PROCUREMENT_WORKSPACE, "build_plan_item"));
    assertTrue(fieldCodes(PC_PROCUREMENT_WORKSPACE, "build_plan").contains("body"));

    assertEquals(2, relationCount(PC_PROCUREMENT_WORKSPACE, "build_plan_satisfies_requirement"));
    assertEquals(14, relationCount(PC_PROCUREMENT_WORKSPACE, "build_plan_contains_item"));
    assertEquals(14, relationCount(PC_PROCUREMENT_WORKSPACE, "build_plan_item_selects_product"));
    assertEquals(
        14, relationCount(PC_PROCUREMENT_WORKSPACE, "build_plan_item_uses_supplier_quote"));
    assertEquals(12, relationCount(PC_PROCUREMENT_WORKSPACE, "supplier_quote_for_product"));
    assertEquals(12, relationCount(PC_PROCUREMENT_WORKSPACE, "supplier_quote_offered_by_supplier"));

    assertEquals(12, derivedFieldCount(PC_PROCUREMENT_WORKSPACE));
    assertEquals(6, ruleDefinitionCount(PC_PROCUREMENT_WORKSPACE));
    assertEquals("WARN", ruleSeverity(PC_PROCUREMENT_WORKSPACE, "R-PC-INVENTORY"));
    assertEquals(46, readModelTotalCount(PC_PROCUREMENT_WORKSPACE));
    assertEquals(46, distinctFieldValueCount(PC_PROCUREMENT_WORKSPACE, "code"));
    assertEquals(46, distinctFieldValueCount(PC_PROCUREMENT_WORKSPACE, "name"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void pcProcurementViewsExposeDerivedMetadataAndValues() {
    var types =
        http.getForEntity(
                base() + "/workspaces/" + PC_PROCUREMENT_WORKSPACE + "/views/object-types",
                Map[].class)
            .getBody();
    var planType =
        Arrays.stream(types)
            .filter(type -> "build_plan".equals(type.get("code")))
            .findFirst()
            .orElseThrow();
    var fields = (List<Map<String, Object>>) planType.get("fields");
    var derived =
        fields.stream()
            .filter(field -> String.valueOf(field.get("code")).startsWith("total_"))
            .collect(java.util.stream.Collectors.toMap(field -> field.get("code"), field -> field));

    assertDerivedDefinition(derived, "total_price_cny_fx", "方案总价（元）");
    assertDerivedDefinition(derived, "total_power_w_fx", "方案总功耗（瓦）");
    assertDerivedDefinition(derived, "total_performance_score_fx", "方案性能分");

    var page =
        http.getForEntity(
                base()
                    + "/workspaces/"
                    + PC_PROCUREMENT_WORKSPACE
                    + "/views/objects?objectType=build_plan&page=0&pageSize=10",
                Map.class)
            .getBody();
    var first = (Map<String, Object>) ((List<?>) page.get("items")).getFirst();
    assertTrue(((Map<?, ?>) first.get("fields")).containsKey("code"));
    assertTrue(String.valueOf(((Map<?, ?>) first.get("fields")).get("body")).contains("type"));
    assertTrue(((Map<?, ?>) first.get("derived")).containsKey("total_price_cny_fx"));
  }

  @Test
  void pcProcurementTotalsUseSupplierQuotesAndExposeCompatibility() {
    var validPlan =
        objectIdByField(PC_PROCUREMENT_WORKSPACE, "build_plan", "code", "PLAN-PC-VALID");
    var invalidPlan =
        objectIdByField(PC_PROCUREMENT_WORKSPACE, "build_plan", "code", "PLAN-PC-INVALID");

    assertDecimal(
        "8783",
        derivedEvaluator.evaluate(PC_PROCUREMENT_WORKSPACE, validPlan, "total_price_cny_fx"));
    assertDecimal(
        "12872",
        derivedEvaluator.evaluate(PC_PROCUREMENT_WORKSPACE, invalidPlan, "total_price_cny_fx"));
    assertDecimal(
        "560",
        derivedEvaluator.evaluate(
            PC_PROCUREMENT_WORKSPACE, validPlan, "total_performance_score_fx"));
    assertDecimal(
        "518",
        derivedEvaluator.evaluate(
            PC_PROCUREMENT_WORKSPACE, invalidPlan, "total_performance_score_fx"));
    assertDecimal(
        "0",
        derivedEvaluator.evaluate(
            PC_PROCUREMENT_WORKSPACE, validPlan, "cpu_mainboard_platform_span_fx"));
    assertDecimal(
        "1695",
        derivedEvaluator.evaluate(
            PC_PROCUREMENT_WORKSPACE, invalidPlan, "cpu_mainboard_platform_span_fx"));
    assertDecimal(
        "1",
        derivedEvaluator.evaluate(
            PC_PROCUREMENT_WORKSPACE, invalidPlan, "memory_platform_span_fx"));
    assertDecimal(
        "550",
        derivedEvaluator.evaluate(
            PC_PROCUREMENT_WORKSPACE, invalidPlan, "power_supply_capacity_w_fx"));
    var cpuItem =
        objectIdByField(PC_PROCUREMENT_WORKSPACE, "build_plan_item", "code", "ITEM-V-CPU");
    assertDecimal(
        "1699",
        derivedEvaluator.evaluate(PC_PROCUREMENT_WORKSPACE, cpuItem, "selected_unit_price_cny_fx"));
    assertDecimal(
        "125", derivedEvaluator.evaluate(PC_PROCUREMENT_WORKSPACE, cpuItem, "power_w_fx"));
    assertDecimal(
        "85",
        derivedEvaluator.evaluate(
            PC_PROCUREMENT_WORKSPACE, cpuItem, "selected_performance_score_fx"));
    assertDecimal(
        "20", derivedEvaluator.evaluate(PC_PROCUREMENT_WORKSPACE, cpuItem, "quote_inventory_fx"));
  }

  @Test
  void pcProcurementRulesDistinguishValidAndInvalidPlans() {
    var validPlan =
        objectIdByField(PC_PROCUREMENT_WORKSPACE, "build_plan", "code", "PLAN-PC-VALID");
    var invalidPlan =
        objectIdByField(PC_PROCUREMENT_WORKSPACE, "build_plan", "code", "PLAN-PC-INVALID");
    var result =
        ruleChecks.run(
            new RunRuleCheckRequest(
                PC_PROCUREMENT_WORKSPACE,
                UUID.randomUUID(),
                "test-pc-rules-" + UUID.randomUUID(),
                null));
    var runId = UUID.fromString(result.events().getFirst());

    assertEquals(4, blockingResultCount(runId));
    assertTrue(blockingRuleCodes(runId, validPlan).isEmpty());
    assertEquals(
        Set.of("R-PC-BUDGET", "R-PC-POWER", "R-PC-CPU-MAINBOARD", "R-PC-MEMORY"),
        blockingRuleCodes(runId, invalidPlan));
  }

  @Test
  @SuppressWarnings("unchecked")
  void pcProcurementRuleHttpFlowReturnsScopedResults() {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", "author");
    var body =
        Map.of(
            "commandType",
            "RunRuleCheck",
            "workspaceId",
            PC_PROCUREMENT_WORKSPACE.toString(),
            "correlationId",
            UUID.randomUUID().toString(),
            "idempotencyKey",
            "test-pc-http-" + UUID.randomUUID(),
            "payload",
            Map.of("scope", Map.of("objectTypeCode", "build_plan")));
    var command =
        http.postForEntity(
            base() + "/workspaces/" + PC_PROCUREMENT_WORKSPACE + "/rule-commands",
            new HttpEntity<>(body, headers),
            Map.class);

    assertEquals(200, command.getStatusCode().value(), String.valueOf(command.getBody()));
    var runId = String.valueOf(((List<?>) command.getBody().get("events")).getFirst());
    var page =
        http.getForEntity(
                base()
                    + "/workspaces/"
                    + PC_PROCUREMENT_WORKSPACE
                    + "/views/check-results?runId="
                    + runId
                    + "&page=0&size=20",
                Map.class)
            .getBody();
    var items = (List<Map<String, Object>>) page.get("items");
    var validPlan =
        objectIdByField(PC_PROCUREMENT_WORKSPACE, "build_plan", "code", "PLAN-PC-VALID");
    var invalidPlan =
        objectIdByField(PC_PROCUREMENT_WORKSPACE, "build_plan", "code", "PLAN-PC-INVALID");

    assertEquals(4, ((Number) page.get("total")).intValue());
    assertTrue(items.stream().noneMatch(item -> validPlan.toString().equals(item.get("objectId"))));
    assertEquals(
        Set.of("R-PC-BUDGET", "R-PC-POWER", "R-PC-CPU-MAINBOARD", "R-PC-MEMORY"),
        items.stream()
            .filter(item -> invalidPlan.toString().equals(item.get("objectId")))
            .map(item -> String.valueOf(item.get("ruleCode")))
            .collect(java.util.stream.Collectors.toSet()));
    assertTrue(
        items.stream()
            .allMatch(
                item ->
                    item.get("severity") != null
                        && item.get("message") != null
                        && item.get("objectId") != null
                        && item.get("createdAt") != null));
    var isolated =
        http.getForEntity(
                base()
                    + "/workspaces/"
                    + HARDWARE_WORKSPACE
                    + "/views/check-results?runId="
                    + runId
                    + "&page=0&size=20",
                Map.class)
            .getBody();
    assertEquals(0, ((Number) isolated.get("total")).intValue());
  }

  @Test
  void pcProcurementSeedIsIdempotentAcrossRepeatedStarts() throws Exception {
    var objectCount = totalObjectCount(PC_PROCUREMENT_WORKSPACE);
    var relationCount = totalRelationCount(PC_PROCUREMENT_WORKSPACE);
    var commandCount = commandCount(PC_PROCUREMENT_WORKSPACE);

    pcProcurementSeeder.run(null);
    pcProcurementSeeder.run(null);

    assertEquals(objectCount, totalObjectCount(PC_PROCUREMENT_WORKSPACE));
    assertEquals(relationCount, totalRelationCount(PC_PROCUREMENT_WORKSPACE));
    assertEquals(commandCount, commandCount(PC_PROCUREMENT_WORKSPACE));
  }

  @Test
  void devSeedSkipsExistingTechnicalProposalData() throws Exception {
    var objectCounts = technicalObjectCounts();
    var moduleRelations = relationCount(TECHNICAL_WORKSPACE, "proposal_contains_module");

    runner.run(null);

    assertEquals(objectCounts, technicalObjectCounts());
    assertEquals(moduleRelations, relationCount(TECHNICAL_WORKSPACE, "proposal_contains_module"));
  }

  @Test
  void technicalProposalDeclaresBodyFieldAndSeedsRichTextModule() throws Exception {
    // 装载后:proposal 与 module 均声明 body(正文)字段——为富文本内容块铺路(ADR-011)。
    assertTrue(fieldDefExists(TECHNICAL_WORKSPACE, "proposal", "body"), "proposal 应声明 body 字段");
    assertTrue(fieldDefExists(TECHNICAL_WORKSPACE, "module", "body"), "module 应声明 body 字段");

    // seed 留样:电源分系统预置一段合法 Tiptap 正文(段落 + 无序列表)。
    var powerSubsystem = objectIdByField(TECHNICAL_WORKSPACE, "module", "name", "电源分系统");
    var body =
        jdbc.queryForObject(
            "SELECT fields->>'body' FROM rm_object WHERE workspace_id = ? AND object_id = ?",
            String.class,
            TECHNICAL_WORKSPACE,
            powerSubsystem);
    var doc = mapper.readTree(body);
    assertEquals("doc", doc.get("type").asText());
    var blockTypes = new java.util.ArrayList<String>();
    doc.get("content").forEach(node -> blockTypes.add(node.get("type").asText()));
    assertEquals(List.of("paragraph", "bulletList"), blockTypes);
  }

  private boolean fieldDefExists(UUID workspaceId, String objectTypeCode, String fieldCode) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS(
              SELECT 1 FROM field_def field
              JOIN object_type type ON type.id = field.object_type_id
              WHERE type.workspace_id = ? AND type.code = ? AND field.code = ?)
            """,
            Boolean.class,
            workspaceId,
            objectTypeCode,
            fieldCode));
  }

  @Test
  void technicalProposalSnapshotCapturesTreeScopesFromProposalRoot() {
    var proposal = firstObjectId(TECHNICAL_WORKSPACE, "proposal");

    var moduleSnapshot =
        snapshots.capture(
            TECHNICAL_WORKSPACE,
            null,
            new SnapshotTreeScope(proposal, "proposal_contains_module", 5),
            "author");
    var modulePayload = snapshots.get(TECHNICAL_WORKSPACE, moduleSnapshot.snapshotId()).payload();

    assertEquals("proposal", modulePayload.objects().getFirst().objectTypeCode());
    assertEquals(0, treeDepth(modulePayload.objects().getFirst()));
    assertEquals(7, modulePayload.objects().size());
    assertEquals(6, modulePayload.relations().size());
    assertTrue(
        modulePayload.objects().stream()
            .anyMatch(
                object -> "module".equals(object.objectTypeCode()) && treeDepth(object) == 3));
    assertTrue(
        modulePayload.relations().stream()
            .allMatch(relation -> "proposal_contains_module".equals(relation.relationTypeCode())));

    var systemSnapshot =
        snapshots.capture(
            TECHNICAL_WORKSPACE,
            null,
            new SnapshotTreeScope(proposal, "proposal_contains_system", 1),
            "author");
    var systemPayload = snapshots.get(TECHNICAL_WORKSPACE, systemSnapshot.snapshotId()).payload();

    assertEquals(List.of("proposal", "system", "system"), objectTypes(systemPayload.objects()));
    assertEquals(List.of(0, 1, 1), systemPayload.objects().stream().map(this::treeDepth).toList());
  }

  private int objectCount(UUID workspaceId, String objectTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM data_object object
        JOIN object_type type ON type.id = object.object_type_id
        WHERE object.workspace_id = ? AND type.code = ?
        """,
        Integer.class,
        workspaceId,
        objectTypeCode);
  }

  private int totalObjectCount(UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM data_object WHERE workspace_id = ?", Integer.class, workspaceId);
  }

  private int totalRelationCount(UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM data_relation WHERE workspace_id = ?", Integer.class, workspaceId);
  }

  private int commandCount(UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM command_log WHERE workspace_id = ?", Integer.class, workspaceId);
  }

  private int derivedFieldCount(UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM derived_field WHERE workspace_id = ?", Integer.class, workspaceId);
  }

  private int ruleDefinitionCount(UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM rule_def WHERE workspace_id = ?", Integer.class, workspaceId);
  }

  private String ruleSeverity(UUID workspaceId, String ruleCode) {
    return jdbc.queryForObject(
        "SELECT severity FROM rule_def WHERE workspace_id = ? AND rule_code = ?",
        String.class,
        workspaceId,
        ruleCode);
  }

  private Set<String> blockingRuleCodes(UUID runId, UUID objectId) {
    return Set.copyOf(
        jdbc.queryForList(
            """
            SELECT rule_code
            FROM check_result
            WHERE workspace_id = ? AND run_id = ? AND object_id = ? AND severity = 'BLOCK'
            """,
            String.class,
            PC_PROCUREMENT_WORKSPACE,
            runId,
            objectId));
  }

  private int blockingResultCount(UUID runId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM check_result WHERE run_id = ? AND severity = 'BLOCK'",
        Integer.class,
        runId);
  }

  private Map<String, Integer> technicalObjectCounts() {
    return Map.of(
        "proposal", objectCount(TECHNICAL_WORKSPACE, "proposal"),
        "system", objectCount(TECHNICAL_WORKSPACE, "system"),
        "module", objectCount(TECHNICAL_WORKSPACE, "module"),
        "alternative", objectCount(TECHNICAL_WORKSPACE, "alternative"),
        "interface", objectCount(TECHNICAL_WORKSPACE, "interface"),
        "requirement", objectCount(TECHNICAL_WORKSPACE, "requirement"));
  }

  private List<String> objectTypes(List<DataObject> objects) {
    return objects.stream().map(DataObject::objectTypeCode).toList();
  }

  private int treeDepth(DataObject object) {
    return ((Number) ((Map<?, ?>) object.fields().get("_tree")).get("depth")).intValue();
  }

  private int readModelCount(UUID workspaceId, String objectTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM rm_object
        WHERE workspace_id = ? AND object_type_code = ?
        """,
        Integer.class,
        workspaceId,
        objectTypeCode);
  }

  private int readModelTotalCount(UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM rm_object WHERE workspace_id = ?", Integer.class, workspaceId);
  }

  private int distinctFieldValueCount(UUID workspaceId, String fieldCode) {
    return jdbc.queryForObject(
        "SELECT count(DISTINCT fields->>?) FROM rm_object WHERE workspace_id = ?",
        Integer.class,
        fieldCode,
        workspaceId);
  }

  private int templateObjectTypeCount(UUID workspaceId, String objectTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM object_type
        WHERE workspace_id = ? AND template_version_id IS NOT NULL AND code = ?
        """,
        Integer.class,
        workspaceId,
        objectTypeCode);
  }

  private int runtimeObjectTypeCount(UUID workspaceId, String objectTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM object_type
        WHERE workspace_id = ? AND template_version_id IS NULL AND code = ?
        """,
        Integer.class,
        workspaceId,
        objectTypeCode);
  }

  private Set<String> runtimeObjectTypeCodes(UUID workspaceId) {
    return Set.copyOf(
        jdbc.queryForList(
            "SELECT code FROM object_type WHERE workspace_id = ? AND template_version_id IS NULL",
            String.class,
            workspaceId));
  }

  private Set<String> fieldCodes(UUID workspaceId, String objectTypeCode) {
    return Set.copyOf(
        jdbc.queryForList(
            """
            SELECT field.code
            FROM field_def field
            JOIN object_type type ON type.id = field.object_type_id
            WHERE type.workspace_id = ? AND type.code = ?
            """,
            String.class,
            workspaceId,
            objectTypeCode));
  }

  private boolean enumFieldAllows(
      UUID workspaceId, String objectTypeCode, String fieldCode, String value) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT jsonb_exists(field.constraints -> 'enumValues', ?)
            FROM field_def field
            JOIN object_type type ON type.id = field.object_type_id
            WHERE type.workspace_id = ? AND type.code = ? AND field.code = ?
            """,
            Boolean.class,
            value,
            workspaceId,
            objectTypeCode,
            fieldCode));
  }

  private UUID objectIdByField(
      UUID workspaceId, String objectTypeCode, String fieldCode, String expected) {
    return jdbc.queryForObject(
        """
        SELECT object_id
        FROM rm_object
        WHERE workspace_id = ? AND object_type_code = ? AND fields->>? = ?
        """,
        UUID.class,
        workspaceId,
        objectTypeCode,
        fieldCode,
        expected);
  }

  private UUID firstObjectId(UUID workspaceId, String objectTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT object.id
        FROM data_object object
        JOIN object_type type ON type.id = object.object_type_id
        WHERE object.workspace_id = ? AND type.code = ?
        ORDER BY object.created_at, object.id
        LIMIT 1
        """,
        UUID.class,
        workspaceId,
        objectTypeCode);
  }

  private int checkResultCount(UUID workspaceId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM check_result
        WHERE workspace_id = ? AND rule_code = ?
        """,
        Integer.class,
        workspaceId,
        ruleCode);
  }

  @SuppressWarnings("unchecked")
  private void assertMappingCoverage(UUID correspondenceId) {
    var coverage =
        http.getForEntity(
                base()
                    + "/workspaces/"
                    + MBSE_WORKSPACE
                    + "/views/mapping/correspondences/"
                    + correspondenceId
                    + "/coverage?page=0&size=10",
                Map.class)
            .getBody();
    assertEquals(4, ((Number) coverage.get("total")).intValue());
    var items = (List<Map<String, Object>>) coverage.get("items");
    assertEquals(4, items.size(), items.toString());
    assertEquals(3, items.stream().filter(item -> "mapped".equals(item.get("status"))).count());
    assertEquals(1, items.stream().filter(item -> "unmapped".equals(item.get("status"))).count());
    assertTrue(
        items.stream()
            .anyMatch(
                item ->
                    "unmapped".equals(item.get("status"))
                        && String.valueOf(item.get("sourceLabel")).contains("SYSML-REQ-004")));
  }

  private int relationCount(UUID workspaceId, String relationTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM data_relation relation
        JOIN relation_type type ON type.id = relation.relation_type_id
        WHERE relation.workspace_id = ? AND type.code = ? AND relation.status = 'ACTIVE'
        """,
        Integer.class,
        workspaceId,
        relationTypeCode);
  }

  private int runtimeRelationTypeCount(UUID workspaceId, String relationTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM relation_type
        WHERE workspace_id = ? AND code = ?
        """,
        Integer.class,
        workspaceId,
        relationTypeCode);
  }

  private int workspaceProfileCount(UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM workspace_profile WHERE workspace_id = ?",
        Integer.class,
        workspaceId);
  }

  private void assertDecimal(String expected, Object actual) {
    assertEquals(0, new BigDecimal(expected).compareTo(new BigDecimal(String.valueOf(actual))));
  }

  @SuppressWarnings("unchecked")
  private void assertDerivedDefinition(
      Map<Object, Map<String, Object>> definitions, String code, String name) {
    var definition = definitions.get(code);
    assertEquals(name, definition.get("name"));
    assertEquals("number", definition.get("dataType"));
    var constraints = (Map<String, Object>) definition.get("constraints");
    assertEquals(true, constraints.get("computed"));
    assertEquals(true, constraints.get("readOnly"));
    assertFalse(definition.containsKey("derivation"));
  }

  private String base() {
    return "http://localhost:" + port;
  }
}
