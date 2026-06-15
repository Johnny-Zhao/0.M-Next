package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.JsonArtifact;
import com.mnext.engines.exchange.JsonArtifact.ArtifactObject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
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
class SnapshotIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID OTHER = UUID.fromString("99999999-9999-4999-8999-999999999999");
  private static final UUID OBJECT = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

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
  @Autowired ExchangeController exchange;
  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;
  @LocalServerPort int port;

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM snapshot");
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
    insertObject(WORKSPACE, OBJECT, 1, "{\"z\":2,\"a\":1}");
  }

  @Test
  void capturesListsAndGetsAnImmutableSnapshot() {
    var first = capture(WORKSPACE);
    var firstId = UUID.fromString((String) first.get("snapshotId"));
    var firstPayload = payloadText(firstId);
    var same = capture(WORKSPACE);

    assertNotNull(first.get("contentHash"));
    assertEquals(64, ((String) first.get("contentHash")).length());
    assertEquals(first.get("contentHash"), same.get("contentHash"));
    assertEquals("author", first.get("createdBy"));
    assertEquals(get(WORKSPACE, firstId), get(WORKSPACE, firstId));
    assertEquals(2, list(WORKSPACE).size());

    jdbc.update(
        """
        UPDATE rm_object SET fields = '{"a":1,"z":3}'::jsonb, version = 2
        WHERE workspace_id = ? AND object_id = ?
        """,
        WORKSPACE,
        OBJECT);
    var changed = capture(WORKSPACE);

    assertNotEquals(first.get("snapshotId"), changed.get("snapshotId"));
    assertNotEquals(first.get("contentHash"), changed.get("contentHash"));
    assertEquals(firstPayload, payloadText(firstId));
  }

  @Test
  void usesSnapshotAsDiffAndExchangePreviewBaseWhileCurrentStillWorks() throws Exception {
    var snapshot = capture(WORKSPACE);
    var snapshotId = (String) snapshot.get("snapshotId");
    jdbc.update(
        """
        UPDATE rm_object SET fields = '{"a":9,"z":2}'::jsonb, version = 2
        WHERE workspace_id = ? AND object_id = ?
        """,
        WORKSPACE,
        OBJECT);
    var current = snapshots.capture(WORKSPACE, null, "author");

    var snapshotDiff =
        postJson(
            base(WORKSPACE) + "/diff",
            Map.of(
                "base",
                "snapshot:" + snapshotId,
                "other",
                snapshots.get(WORKSPACE, current.snapshotId()).payload()));
    var currentDiff =
        postJson(
            base(WORKSPACE) + "/diff",
            Map.of(
                "base",
                "current",
                "other",
                snapshots.get(WORKSPACE, UUID.fromString(snapshotId)).payload()));
    var artifact =
        new JsonArtifact(
            1,
            WORKSPACE.toString(),
            "demo",
            List.of(new ArtifactObject("demo", Map.of("a", 9, "z", 2), OBJECT.toString())),
            List.of());
    var preview =
        exchange.preview(WORKSPACE, "snapshot:" + snapshotId, mapper.writeValueAsString(artifact));

    assertEquals(1, summary(snapshotDiff, "objectsChanged"));
    assertEquals(1, summary(currentDiff, "objectsChanged"));
    assertEquals(1, preview.summary().objectsChanged());
  }

  @Test
  void isolatesWorkspacesAndRepositoryHasNoForbiddenAccess() throws Exception {
    var snapshot = capture(WORKSPACE);
    var id = UUID.fromString((String) snapshot.get("snapshotId"));
    var response = http.getForEntity(base(OTHER) + "/snapshots/" + id, Map.class);
    var source =
        Files.readString(Path.of("src/main/java/com/mnext/server/SnapshotRepository.java"))
            .toLowerCase();

    assertEquals(400, response.getStatusCode().value());
    assertTrue(source.contains("insert into snapshot"));
    assertFalse(source.contains("kernelcommandservice"));
    assertFalse(source.contains("event_outbox"));
    assertFalse(source.contains("data_object"));
    assertFalse(source.contains("data_field_value"));
    assertFalse(source.contains("data_relation"));
    assertFalse(source.contains("update "));
    assertFalse(source.contains("delete from"));
  }

  @Test
  void scopesCaptureByObjectTypeAndBoundsListSize() {
    insertObject(WORKSPACE, UUID.randomUUID(), 1, "{\"name\":\"second demo\"}");
    jdbc.update(
        "UPDATE rm_object SET object_type_code = 'other' WHERE workspace_id = ? AND object_id <> ?",
        WORKSPACE,
        OBJECT);
    var scoped = capture(WORKSPACE, Map.of("scopeObjectType", "demo"));
    var detail = get(WORKSPACE, UUID.fromString((String) scoped.get("snapshotId")));
    var payload = (Map<?, ?>) detail.get("payload");

    assertEquals(1, ((List<?>) payload.get("objects")).size());
    assertEquals(
        400,
        http.getForEntity(base(WORKSPACE) + "/snapshots?size=51", Map.class)
            .getStatusCode()
            .value());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> capture(UUID workspace) {
    return capture(workspace, Map.of());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> capture(UUID workspace, Object body) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "author");
    var response =
        http.postForEntity(
            base(workspace) + "/snapshots", new HttpEntity<>(body, headers), Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(UUID workspace, UUID snapshotId) {
    var response = http.getForEntity(base(workspace) + "/snapshots/" + snapshotId, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> list(UUID workspace) {
    var response = http.getForEntity(base(workspace) + "/snapshots?size=50", Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (List<Map<String, Object>>) response.getBody().get("items");
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> postJson(String url, Object body) {
    var response = http.postForEntity(url, body, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private int summary(Map<String, Object> response, String name) {
    return ((Number) ((Map<?, ?>) response.get("summary")).get(name)).intValue();
  }

  private String payloadText(UUID snapshotId) {
    return jdbc.queryForObject(
        "SELECT payload::text FROM snapshot WHERE snapshot_id = ?", String.class, snapshotId);
  }

  private void insertObject(UUID workspace, UUID objectId, long version, String fields) {
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, 'demo', 'DRAFT', ?, CAST(? AS jsonb), now())
        """,
        workspace,
        objectId,
        version,
        fields);
  }

  private String base(UUID workspace) {
    return "http://localhost:" + port + "/workspaces/" + workspace;
  }
}
