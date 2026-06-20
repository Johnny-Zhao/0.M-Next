package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import com.mnext.server.storage.StorageBackend;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
    properties = {"mnext.readmodel.enabled=false", "mnext.outbox.enabled=false"})
class AttachmentE2EIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID OTHER_WORKSPACE =
      UUID.fromString("99999999-9999-4999-8999-999999999999");
  private static final UUID TYPE = UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final byte[] PDF_BYTES =
      "%PDF-1".getBytes(java.nio.charset.StandardCharsets.UTF_8);

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  private static final java.nio.file.Path STORAGE_DIR =
      java.nio.file.Path.of(
          System.getProperty("java.io.tmpdir"), "mnext-attachments-test-" + UUID.randomUUID());

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
    registry.add("mnext.storage.dir", () -> STORAGE_DIR.toString());
    registry.add("mnext.storage.max-bytes", () -> "16");
  }

  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @Autowired OutboxPublisher publisher;
  @Autowired TransactionTemplate transactions;
  @Autowired StorageBackend storage;
  @LocalServerPort int port;

  @Test
  void attachmentStorageMvpCompletesThroughPureApi() throws Exception {
    var objectId = createObject("attachment-target-" + UUID.randomUUID());
    var blob = upload("quote.pdf", "application/pdf", PDF_BYTES);

    var badAttach =
        attach("bad-sha", objectId, blob, "bad" + blob.get("sha256").toString().substring(3));
    assertEquals(409, badAttach.getStatusCode().value());

    var attachCommand = attachCommand("attach-1", objectId, blob, blob.get("sha256").toString());
    var attached = postCommand("attachment-commands", attachCommand);
    assertEquals(200, attached.getStatusCode().value(), String.valueOf(attached.getBody()));
    var attachmentId = attachmentId(attached.getBody());
    var replay = postCommand("attachment-commands", attachCommand);
    assertEquals(200, replay.getStatusCode().value());
    assertEquals(attachmentId, attachmentId(replay.getBody()));

    drainOutbox();
    var views = attachments(objectId, "ACTIVE");
    var first =
        views.stream()
            .filter(row -> attachmentId.toString().equals(row.get("id").toString()))
            .findFirst()
            .orElseThrow();
    assertEquals("quote.pdf", first.get("filename"));
    assertEquals(blob.get("sha256"), first.get("sha256"));
    assertFalse(first.containsKey("storageKey"));

    var content = download(WORKSPACE, attachmentId);
    assertEquals(200, content.getStatusCode().value());
    assertArrayEquals(PDF_BYTES, content.getBody());
    assertEquals(404, download(OTHER_WORKSPACE, attachmentId).getStatusCode().value());

    assertEquals(413, uploadStatus("large.pdf", "application/pdf", "0123456789abcdefg".getBytes()));
    assertEquals(415, uploadStatus("bad.exe", "application/x-msdownload", new byte[] {1}));

    for (int index = 2; index <= 50; index++) {
      assertEquals(
          200,
          attach("attach-" + index, objectId, blob, blob.get("sha256").toString())
              .getStatusCode()
              .value());
    }
    assertEquals(
        409,
        attach("attach-51", objectId, blob, blob.get("sha256").toString()).getStatusCode().value());

    assertEquals(200, detach("detach-1", attachmentId).getStatusCode().value());
    drainOutbox();
    assertTrue(storage.exists(blob.get("storageKey").toString()));
    assertEquals(404, download(WORKSPACE, attachmentId).getStatusCode().value());
    assertTrue(
        attachments(objectId, "ACTIVE").stream()
            .noneMatch(row -> attachmentId.toString().equals(row.get("id").toString())));
  }

  private UUID createObject(String name) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeId", TYPE.toString());
    payload.put("fields", Map.of("name", name));
    payload.put("source", Map.of("type", "manual"));
    var response = postCommand("commands", envelope("CreateObject", "create-" + name, payload));
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    drainOutbox();
    return objects().stream()
        .filter(row -> name.equals(((Map<?, ?>) row.get("fields")).get("name")))
        .map(row -> UUID.fromString(row.get("objectId").toString()))
        .findFirst()
        .orElseThrow();
  }

  private Map<String, Object> upload(String filename, String contentType, byte[] bytes) {
    var response = uploadResponse(filename, contentType, bytes);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertNotNull(response.getBody().get("storageKey"));
    assertEquals(bytes.length, ((Number) response.getBody().get("sizeBytes")).longValue());
    return response.getBody();
  }

  private int uploadStatus(String filename, String contentType, byte[] bytes) {
    return uploadResponse(filename, contentType, bytes).getStatusCode().value();
  }

  private ResponseEntity<Map> uploadResponse(String filename, String contentType, byte[] bytes) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.parseMediaType(contentType));
    headers.set("X-Filename", filename);
    return http.exchange(
        base(WORKSPACE) + "/attachments/blob",
        HttpMethod.POST,
        new HttpEntity<>(bytes, headers),
        Map.class);
  }

  private ResponseEntity<Map> attach(
      String key, UUID objectId, Map<String, Object> blob, String sha256) {
    return postCommand("attachment-commands", attachCommand(key, objectId, blob, sha256));
  }

  private Map<String, Object> attachCommand(
      String key, UUID objectId, Map<String, Object> blob, String sha256) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectId", objectId.toString());
    payload.put("filename", "quote.pdf");
    payload.put("contentType", blob.get("contentType"));
    payload.put("sizeBytes", blob.get("sizeBytes"));
    payload.put("sha256", sha256);
    payload.put("storageKey", blob.get("storageKey"));
    return envelope("AttachFile", key, payload);
  }

  private ResponseEntity<Map> detach(String key, UUID attachmentId) {
    return postCommand(
        "attachment-commands",
        envelope("DetachFile", key, Map.of("attachmentId", attachmentId.toString())));
  }

  private ResponseEntity<Map> postCommand(String endpoint, Map<String, Object> command) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "attachment-test");
    return http.postForEntity(
        base(WORKSPACE) + "/" + endpoint, new HttpEntity<>(command, headers), Map.class);
  }

  private Map<String, Object> envelope(
      String commandType, String key, Map<String, Object> payload) {
    var command = new LinkedHashMap<String, Object>();
    command.put("commandType", commandType);
    command.put("workspaceId", WORKSPACE.toString());
    command.put("correlationId", UUID.randomUUID().toString());
    command.put("idempotencyKey", key);
    command.put("payload", payload);
    return command;
  }

  private List<Map<String, Object>> objects() {
    var response =
        http.getForEntity(
            base(WORKSPACE) + "/views/objects?objectType=demo_object&pageSize=200", Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (List<Map<String, Object>>) response.getBody().get("items");
  }

  private List<Map<String, Object>> attachments(UUID objectId, String status) {
    var response =
        http.getForEntity(
            base(WORKSPACE) + "/views/attachments?objectId=" + objectId + "&status=" + status,
            List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private ResponseEntity<byte[]> download(UUID workspaceId, UUID attachmentId) {
    return http.getForEntity(
        base(workspaceId) + "/attachments/" + attachmentId + "/content", byte[].class);
  }

  private UUID attachmentId(Map<?, ?> result) {
    var events = (List<?>) result.get("events");
    assertNotNull(events);
    return events.stream()
        .map(Object::toString)
        .filter(value -> value.startsWith("attachmentId="))
        .map(value -> UUID.fromString(value.substring("attachmentId=".length())))
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

  private String base(UUID workspaceId) {
    return "http://localhost:" + port + "/workspaces/" + workspaceId;
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
