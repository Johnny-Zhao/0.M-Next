package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

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
class ObjectSourceQueryIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID AUTHOR = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  private static final UUID TYPE = UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final String XLSX_TYPE =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  private static final java.nio.file.Path STORAGE_DIR =
      java.nio.file.Path.of(
          System.getProperty("java.io.tmpdir"), "mnext-source-test-" + UUID.randomUUID());

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
  void reset() {
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
        "INSERT INTO workspace_member (workspace_id, user_id, role, granted_by) VALUES (?, ?, 'AUTHOR', ?)",
        WORKSPACE,
        AUTHOR,
        AUTHOR.toString());
  }

  @Test
  void exposesProjectedObjectSourceKindInListAndDetail() throws Exception {
    createManualObject();
    importObject();
    insertHistoricalObjectWithoutSource();
    drainOutbox();

    var objects = objects();
    var manual = byName(objects, "Manual");
    var imported = byName(objects, "Imported");
    var historical = byName(objects, "Historical");

    assertEquals("manual", manual.get("source"));
    assertEquals("artifact_sync", imported.get("source"));
    assertNull(historical.get("source"));
    assertNotNull(manual.get("updatedAt"));

    assertEquals("manual", detailSource(manual));
    assertEquals("artifact_sync", detailSource(imported));
    assertNull(detailSource(historical));
    assertEquals("UNKNOWN", manual.get("ruleStatus"));
  }

  private void createManualObject() {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeId", TYPE.toString());
    payload.put("fields", Map.of("name", "Manual"));
    payload.put("source", Map.of("type", "manual"));
    var response = post("/commands", envelope("CreateObject", "manual-source", payload));
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private void importObject() throws Exception {
    var upload = upload(workbookBytes(), "objects.xlsx");
    assertEquals(200, upload.getStatusCode().value(), String.valueOf(upload.getBody()));
    var importId = UUID.fromString(upload.getBody().get("importId").toString());
    var parsed = post("/imports/" + importId + "/parse", mapping());
    assertEquals(200, parsed.getStatusCode().value(), String.valueOf(parsed.getBody()));
  }

  private void insertHistoricalObjectWithoutSource() {
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, 'demo_object', 'DRAFT', 1, '{"name":"Historical"}'::jsonb, now())
        """,
        WORKSPACE,
        UUID.randomUUID());
  }

  private Map<String, Object> envelope(
      String commandType, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("commandType", commandType);
    request.put("workspaceId", WORKSPACE.toString());
    request.put("correlationId", UUID.randomUUID().toString());
    request.put("idempotencyKey", key);
    request.put("payload", payload);
    return request;
  }

  private Map<String, Object> mapping() {
    var mapping = new LinkedHashMap<String, Object>();
    mapping.put("sheet", "Objects");
    mapping.put("headerRow", 0);
    mapping.put("objectTypeCode", "demo_object");
    mapping.put("keyColumn", "Name");
    mapping.put("columns", List.of(Map.of("header", "Name", "fieldDefCode", "name")));
    return mapping;
  }

  private List<Map<String, Object>> objects() {
    var response = get("/views/objects?objectType=demo_object&page=0&pageSize=200", Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (List<Map<String, Object>>) response.getBody().get("items");
  }

  private Map<String, Object> byName(List<Map<String, Object>> objects, String name) {
    return objects.stream()
        .filter(row -> name.equals(((Map<?, ?>) row.get("fields")).get("name")))
        .findFirst()
        .orElseThrow();
  }

  private Object detailSource(Map<String, Object> object) {
    var response = get("/views/objects/" + object.get("objectId"), Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return ((Map<?, ?>) response.getBody().get("object")).get("source");
  }

  private ResponseEntity<Map> upload(byte[] bytes, String filename) {
    var headers = headers();
    headers.set("X-Filename", filename);
    headers.setContentType(MediaType.parseMediaType(XLSX_TYPE));
    return http.exchange(
        base() + "/imports", HttpMethod.POST, new HttpEntity<>(bytes, headers), Map.class);
  }

  private ResponseEntity<Map> post(String path, Object body) {
    var headers = headers();
    headers.setContentType(MediaType.APPLICATION_JSON);
    return http.postForEntity(base() + path, new HttpEntity<>(body, headers), Map.class);
  }

  private <T> ResponseEntity<T> get(String path, Class<T> type) {
    return http.exchange(base() + path, HttpMethod.GET, new HttpEntity<>(null, headers()), type);
  }

  private HttpHeaders headers() {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", AUTHOR.toString());
    return headers;
  }

  private void drainOutbox() {
    var relay = new TestOutboxRelay(new OutboxRelay(jdbc, publisher), transactions);
    for (int index = 0; index < 100; index++) {
      if (relay.drain() == 0) return;
    }
    throw new AssertionError("outbox did not drain within bounded attempts");
  }

  private String base() {
    return "http://localhost:" + port + "/workspaces/" + WORKSPACE;
  }

  private static byte[] workbookBytes() throws Exception {
    try (var workbook = new XSSFWorkbook();
        var output = new ByteArrayOutputStream()) {
      var sheet = workbook.createSheet("Objects");
      var header = sheet.createRow(0);
      header.createCell(0).setCellValue("Name");
      var row = sheet.createRow(1);
      row.createCell(0).setCellValue("Imported");
      workbook.write(output);
      return output.toByteArray();
    }
  }

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
