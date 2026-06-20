package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import java.io.ByteArrayOutputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "mnext.readmodel.enabled=false",
      "mnext.outbox.enabled=false",
      "mnext.import.max-bytes=20000"
    })
class ExcelImportE2EIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID AUTHOR = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  private static final UUID VIEWER = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  private static final java.nio.file.Path STORAGE_DIR =
      java.nio.file.Path.of(
          System.getProperty("java.io.tmpdir"), "mnext-imports-test-" + UUID.randomUUID());

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
    registry.add("mnext.storage.dir", () -> STORAGE_DIR.toString());
  }

  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @Autowired OutboxPublisher publisher;
  @Autowired TransactionTemplate transactions;
  @LocalServerPort int port;

  @BeforeEach
  void seedGovernance() {
    jdbc.update("DELETE FROM import_task");
    jdbc.update("DELETE FROM workspace_member");
    jdbc.update("DELETE FROM app_user");
    jdbc.update("DELETE FROM rm_consumed_event");
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
    jdbc.update("DELETE FROM relation_closure");
    jdbc.update("DELETE FROM relation_history");
    jdbc.update("DELETE FROM data_relation");
    jdbc.update("DELETE FROM event_outbox");
    jdbc.update("DELETE FROM command_log");
    jdbc.update("DELETE FROM field_value_history");
    jdbc.update("DELETE FROM data_field_value");
    jdbc.update("DELETE FROM data_object");
    jdbc.update(
        "INSERT INTO app_user (id, display_name, status) VALUES (?, 'Author', 'ACTIVE')", AUTHOR);
    jdbc.update(
        "INSERT INTO app_user (id, display_name, status) VALUES (?, 'Viewer', 'ACTIVE')", VIEWER);
    jdbc.update(
        "INSERT INTO workspace_member (workspace_id, user_id, role, granted_by) VALUES (?, ?, 'AUTHOR', ?)",
        WORKSPACE,
        AUTHOR,
        AUTHOR.toString());
    jdbc.update(
        "INSERT INTO workspace_member (workspace_id, user_id, role, granted_by) VALUES (?, ?, 'VIEWER', ?)",
        WORKSPACE,
        VIEWER,
        AUTHOR.toString());
  }

  @Test
  void excelImportRegistersMetadataParsesAndIsIdempotent() throws Exception {
    assertEquals(
        403, upload(VIEWER, workbookBytes(), XLSX_TYPE, "objects.xlsx").getStatusCode().value());

    var upload = upload(AUTHOR, workbookBytes(), XLSX_TYPE, "objects.xlsx");
    assertEquals(200, upload.getStatusCode().value(), String.valueOf(upload.getBody()));
    var importId = UUID.fromString(upload.getBody().get("importId").toString());
    assertNotNull(upload.getBody().get("storageKey"));
    assertNotNull(upload.getBody().get("sha256"));

    var metadata = get(AUTHOR, "/imports/" + importId + "/metadata", Map.class);
    assertEquals(200, metadata.getStatusCode().value(), String.valueOf(metadata.getBody()));
    var sheets = (List<Map<String, Object>>) metadata.getBody().get("sheets");
    assertEquals("Objects", sheets.getFirst().get("name"));
    assertEquals(List.of("Name", "Cost", "Owner"), sheets.getFirst().get("headers"));

    var parsed = post(AUTHOR, "/imports/" + importId + "/parse", mapping(), Map.class);
    assertEquals(200, parsed.getStatusCode().value(), String.valueOf(parsed.getBody()));
    assertEquals(2, ((Number) parsed.getBody().get("created")).intValue());
    drainOutbox();
    assertEquals(2, objects().size());
    assertEquals(12, importedCost("Pump"));

    var replay = post(AUTHOR, "/imports/" + importId + "/parse", mapping(), Map.class);
    assertEquals(200, replay.getStatusCode().value());
    assertEquals(2, ((Number) replay.getBody().get("created")).intValue());
    drainOutbox();
    assertEquals(2, objects().size());

    assertEquals(
        404,
        get(AUTHOR, "/imports/" + UUID.randomUUID() + "/metadata", Map.class)
            .getStatusCode()
            .value());
    assertEquals(
        400,
        post(AUTHOR, "/imports/" + importId + "/parse", Map.of("sheet", "Objects"), Map.class)
            .getStatusCode()
            .value());
    assertEquals(
        415, upload(AUTHOR, "bad".getBytes(), "text/plain", "bad.txt").getStatusCode().value());
    assertEquals(
        413, upload(AUTHOR, new byte[21000], XLSX_TYPE, "large.xlsx").getStatusCode().value());
  }

  private ResponseEntity<Map> upload(
      UUID actor, byte[] bytes, String contentType, String filename) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", actor.toString());
    headers.set("X-Filename", filename);
    headers.setContentType(MediaType.parseMediaType(contentType));
    return http.exchange(
        base() + "/imports", HttpMethod.POST, new HttpEntity<>(bytes, headers), Map.class);
  }

  private <T> ResponseEntity<T> get(UUID actor, String path, Class<T> type) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", actor.toString());
    return http.exchange(base() + path, HttpMethod.GET, new HttpEntity<>(null, headers), type);
  }

  private <T> ResponseEntity<T> post(UUID actor, String path, Object body, Class<T> type) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", actor.toString());
    headers.setContentType(MediaType.APPLICATION_JSON);
    return http.postForEntity(base() + path, new HttpEntity<>(body, headers), type);
  }

  private Map<String, Object> mapping() {
    var mapping = new LinkedHashMap<String, Object>();
    mapping.put("sheet", "Objects");
    mapping.put("headerRow", 0);
    mapping.put("objectTypeCode", "demo_object");
    mapping.put("keyColumn", "Name");
    mapping.put(
        "columns",
        List.of(
            Map.of("header", "Name", "fieldDefCode", "name"),
            Map.of("header", "Cost", "fieldDefCode", "cost"),
            Map.of("header", "Owner", "fieldDefCode", "owner")));
    return mapping;
  }

  private List<Map<String, Object>> objects() {
    var response = get(AUTHOR, "/views/objects?objectType=demo_object&pageSize=200", Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (List<Map<String, Object>>) response.getBody().get("items");
  }

  private int importedCost(String name) {
    return objects().stream()
        .filter(row -> name.equals(((Map<?, ?>) row.get("fields")).get("name")))
        .map(row -> ((Number) ((Map<?, ?>) row.get("fields")).get("cost")).intValue())
        .findFirst()
        .orElseThrow();
  }

  private void drainOutbox() {
    var relay = new TestOutboxRelay(new OutboxRelay(jdbc, publisher), transactions);
    for (int index = 0; index < 100; index++) {
      if (relay.drain() == 0) return;
    }
    throw new AssertionError("outbox did not drain within bounded attempts");
  }

  private static byte[] workbookBytes() throws Exception {
    try (var workbook = new XSSFWorkbook();
        var output = new ByteArrayOutputStream()) {
      var sheet = workbook.createSheet("Objects");
      var header = sheet.createRow(0);
      header.createCell(0).setCellValue("Name");
      header.createCell(1).setCellValue("Cost");
      header.createCell(2).setCellValue("Owner");
      var first = sheet.createRow(1);
      first.createCell(0).setCellValue("Pump");
      first.createCell(1).setCellValue(12);
      first.createCell(2).setCellValue("Ada");
      sheet.createRow(2);
      var second = sheet.createRow(3);
      second.createCell(0).setCellValue("Valve");
      second.createCell(1).setCellValue(5);
      second.createCell(2).setCellValue("Ben");
      workbook.write(output);
      return output.toByteArray();
    }
  }

  private String base() {
    return "http://localhost:" + port + "/workspaces/" + WORKSPACE;
  }

  private static final String XLSX_TYPE =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  @TestConfiguration
  static class ProjectionPublisherConfig {
    @Bean
    @Primary
    OutboxPublisher outboxPublisher(ObjectMapper mapper, ReadModelProjection projection) {
      return (workspaceId, payload) -> {
        try {
          projection.apply(mapper.readValue(payload, EventEnvelope.class));
        } catch (Exception failure) {
          throw new IllegalStateException(failure);
        }
      };
    }
  }
}
