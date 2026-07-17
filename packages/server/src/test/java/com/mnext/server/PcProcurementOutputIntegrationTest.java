package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.output.OutputTemplate.SectionMapping;
import com.mnext.engines.output.OutputTemplate.SectionMapping.RelationColumn;
import com.mnext.engines.output.OutputTemplate.SectionMapping.RelationTable;
import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
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
class PcProcurementOutputIntegrationTest {
  private static final UUID WORKSPACE = PcProcurementDevSeeder.WORKSPACE_ID;
  private static final UUID AUTHOR = ProfileLoader.AUTHOR_WORKSPACE;
  private static final UUID VIEWER = UUID.fromString("77777777-7777-4777-8777-777777777777");

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired SnapshotRepository snapshots;
  @Autowired OutputSnapshotRepository outputs;
  @Autowired RuleCheckRunner ruleChecks;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestRestTemplate http;
  @LocalServerPort int port;

  @Test
  void rendersCompletePcDocumentAndKeepsItsSnapshotIsolated() throws Exception {
    governWorkspace();
    var plan = objectId("build_plan", "PLAN-PC-VALID");
    var item = objectId("build_plan_item", "ITEM-V-CPU");
    runFullWorkspaceCheck("pc-output-initial");

    var firstSnapshot = capture(plan);
    var firstOutput = createDocx(firstSnapshot);
    var firstText = docxText(firstOutput);

    assertCompleteDocument(firstText);
    assertEquals("OK", firstOutput.checkStatus());

    updateQuantity(item, 2);
    runFullWorkspaceCheck("pc-output-updated");
    var sameSnapshotOutput = createDocx(firstSnapshot);
    var secondSnapshot = capture(plan);
    var secondOutput = createDocx(secondSnapshot);

    assertEquals(firstOutput.contentHash(), sameSnapshotOutput.contentHash());
    assertEquals(firstText, docxText(sameSnapshotOutput));
    assertTrue(tableLines(firstOutput).stream().anyMatch(row -> row.startsWith("ITEM-V-CPU|兼容方案 CPU|1|")));
    assertTrue(tableLines(secondOutput).stream().anyMatch(row -> row.startsWith("ITEM-V-CPU|兼容方案 CPU|2|")));
    assertNotEquals(firstOutput.contentHash(), secondOutput.contentHash());
    assertEquals("BLOCK", secondOutput.checkStatus());
  }

  @Test
  void rejectsUnauthorizedAndMissingSnapshotOutputRequests() {
    governWorkspace();
    var plan = objectId("build_plan", "PLAN-PC-VALID");
    var snapshot = capture(plan);

    var forbidden = postOutput(snapshot, VIEWER);
    assertEquals(403, forbidden.getStatusCode().value());
    assertEquals("AUTH-403-FORBIDDEN", error(forbidden).get("code"));
    assertFalse(String.valueOf(error(forbidden).get("message")).isBlank());

    var missing = postOutput(UUID.randomUUID(), AUTHOR);
    assertEquals(400, missing.getStatusCode().value());
    assertFalse(String.valueOf(error(missing).get("message")).isBlank());
  }

  private void governWorkspace() {
    jdbc.update(
        """
        INSERT INTO app_user (id, display_name, status) VALUES (?, ?, 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
        """,
        AUTHOR,
        "PC 输出作者");
    jdbc.update(
        """
        INSERT INTO app_user (id, display_name, status) VALUES (?, ?, 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
        """,
        VIEWER,
        "PC 输出只读者");
    jdbc.update(
        """
        INSERT INTO workspace_member (workspace_id, user_id, role, granted_by)
        VALUES (?, ?, 'AUTHOR', ?) ON CONFLICT (workspace_id, user_id) DO NOTHING
        """,
        WORKSPACE,
        AUTHOR,
        AUTHOR.toString());
    jdbc.update(
        """
        INSERT INTO workspace_member (workspace_id, user_id, role, granted_by)
        VALUES (?, ?, 'VIEWER', ?) ON CONFLICT (workspace_id, user_id) DO NOTHING
        """,
        WORKSPACE,
        VIEWER,
        AUTHOR.toString());
  }

  private UUID objectId(String type, String code) {
    return jdbc.queryForObject(
        """
        SELECT object_id FROM rm_object
        WHERE workspace_id = ? AND object_type_code = ? AND fields ->> 'code' = ?
        """,
        UUID.class,
        WORKSPACE,
        type,
        code);
  }

  private void runFullWorkspaceCheck(String correlationId) {
    ruleChecks.run(
        new RunRuleCheckRequest(WORKSPACE, UUID.randomUUID(), correlationId, null));
  }

  private UUID capture(UUID plan) {
    return snapshots
        .capture(
            WORKSPACE,
            null,
            new SnapshotTreeScope(
                plan,
                "build_plan_contains_item",
                1,
                List.of(
                    "build_plan_satisfies_requirement",
                    "build_plan_contains_item",
                    "build_plan_item_selects_product",
                    "build_plan_item_uses_supplier_quote",
                    "supplier_quote_for_product",
                    "supplier_quote_offered_by_supplier")),
            AUTHOR.toString())
        .snapshotId();
  }

  private OutputMeta createDocx(UUID snapshotId) {
    return outputs.create(
        WORKSPACE,
        new OutputCreateRequest(snapshotId, "docx", null, null, null, List.of(), sectionMapping(), null),
        AUTHOR.toString());
  }

  private void updateQuantity(UUID item, int quantity) {
    jdbc.update(
        """
        UPDATE rm_object
        SET fields = jsonb_set(fields, '{quantity}', to_jsonb(CAST(? AS integer))),
            version = version + 1, updated_at = now()
        WHERE workspace_id = ? AND object_id = ?
        """,
        quantity,
        WORKSPACE,
        item);
  }

  private ResponseEntity<Map> postOutput(UUID snapshotId, UUID actor) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", actor.toString());
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + WORKSPACE + "/outputs",
        new HttpEntity<>(
            Map.of("snapshotId", snapshotId, "format", "docx", "sectionMapping", sectionMapping()),
            headers),
        Map.class);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> error(ResponseEntity<Map> response) {
    return (Map<String, Object>) response.getBody().get("error");
  }

  private String docxText(OutputMeta output) throws Exception {
    var detail = outputs.get(WORKSPACE, output.outputId());
    try (var document = new XWPFDocument(new ByteArrayInputStream(detail.artifact()))) {
      var paragraphs = document.getParagraphs().stream().map(p -> p.getText()).toList();
      var cells =
          document.getTables().stream()
              .flatMap(table -> table.getRows().stream())
              .flatMap(row -> row.getTableCells().stream())
              .map(cell -> cell.getText())
              .toList();
      return String.join("\n", paragraphs) + "\n" + String.join("\n", cells);
    }
  }

  private List<String> tableLines(OutputMeta output) throws Exception {
    var detail = outputs.get(WORKSPACE, output.outputId());
    try (var document = new XWPFDocument(new ByteArrayInputStream(detail.artifact()))) {
      return document.getTables().stream()
          .flatMap(table -> table.getRows().stream())
          .map(row -> row.getTableCells().stream().map(cell -> cell.getText()).collect(java.util.stream.Collectors.joining("|")))
          .toList();
    }
  }

  private void assertCompleteDocument(String text) {
    assertTrue(text.contains("采购需求摘要"), text);
    assertTrue(text.contains("研发工作站采购需求"), text);
    assertTrue(text.contains("10000"), text);
    assertTrue(text.contains("兼容工作站方案"), text);
    assertTrue(text.contains("8783"), text);
    assertTrue(text.contains("Intel Core i5-14600K"), text);
    assertTrue(text.contains("华北数码供应商"), text);
    assertTrue(text.contains("1699"), text);
    assertTrue(text.contains("兼容工作站采购方案说明"), text);
    assertTrue(text.contains("校核结论"), text);
  }

  private SectionMapping sectionMapping() {
    return new SectionMapping(
        Map.of(),
        Map.of(
            "code", "table",
            "name", "table",
            "status", "table",
            "total_price_cny_fx", "table",
            "total_power_w_fx", "table",
            "total_performance_score_fx", "table",
            "power_supply_capacity_w_fx", "table"),
        Map.of(
            "code", "编码",
            "name", "名称",
            "status", "状态",
            "total_price_cny_fx", "方案总价（元）",
            "total_power_w_fx", "方案总功耗（瓦）",
            "total_performance_score_fx", "方案性能分",
            "power_supply_capacity_w_fx", "电源容量（瓦）"),
        List.of(requirementTable(), itemTable()));
  }

  private RelationTable requirementTable() {
    return new RelationTable(
        "build_plan_satisfies_requirement",
        "采购需求摘要",
        List.of(
            new RelationColumn("需求编码", "code", List.of()),
            new RelationColumn("需求名称", "name", List.of()),
            new RelationColumn("预算（元）", "budget_cny", List.of()),
            new RelationColumn("整机最大设计功耗（瓦）", "max_total_power_w", List.of()),
            new RelationColumn("CPU/主板平台要求", "cpu_mainboard_platform_code", List.of()),
            new RelationColumn("内存平台要求", "memory_platform_code", List.of())));
  }

  private RelationTable itemTable() {
    return new RelationTable(
        "build_plan_contains_item",
        "方案明细表",
        List.of(
            new RelationColumn("明细编码", "code", List.of()),
            new RelationColumn("明细名称", "name", List.of()),
            new RelationColumn("数量", "quantity", List.of()),
            new RelationColumn("产品编码", "code", List.of("build_plan_item_selects_product")),
            new RelationColumn("产品名称", "name", List.of("build_plan_item_selects_product")),
            new RelationColumn("报价编码", "code", List.of("build_plan_item_uses_supplier_quote")),
            new RelationColumn(
                "供应商",
                "name",
                List.of("build_plan_item_uses_supplier_quote", "supplier_quote_offered_by_supplier")),
            new RelationColumn("单价（元）", "selected_unit_price_cny_fx", List.of()),
            new RelationColumn("明细总价（元）", "total_price_cny_fx", List.of()),
            new RelationColumn("功耗（瓦）", "power_w_fx", List.of()),
            new RelationColumn("性能分", "selected_performance_score_fx", List.of()),
            new RelationColumn("报价库存", "quote_inventory_fx", List.of())));
  }
}
