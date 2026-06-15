package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
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
class OutputIntegrationTest {
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
  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @LocalServerPort int port;

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM output_snapshot");
    jdbc.update("DELETE FROM snapshot");
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
    insertObject(WORKSPACE, OBJECT, 1, "{\"name\":\"one\",\"cost\":1}");
  }

  @Test
  void createsAndGetsImmutableOutputFromSnapshot() {
    var snapshot = snapshots.capture(WORKSPACE, null, "author");

    var created = create(WORKSPACE, Map.of("snapshotId", snapshot.snapshotId(), "format", "html"));
    var detail = get(WORKSPACE, UUID.fromString((String) created.get("outputId")));
    var same = get(WORKSPACE, UUID.fromString((String) created.get("outputId")));

    assertNotNull(created.get("contentHash"));
    assertEquals(64, ((String) created.get("contentHash")).length());
    assertEquals(snapshot.snapshotId().toString(), created.get("dataSnapshotId"));
    assertEquals("renderer", created.get("createdBy"));
    assertEquals(detail.get("artifact"), same.get("artifact"));
    assertTrue(String.valueOf(detail.get("artifact")).length() > 10);
    assertEquals(1, list(WORKSPACE));
  }

  @Test
  void newSnapshotProducesNewHashWhileOldArtifactStaysUnchanged() {
    var firstSnapshot = snapshots.capture(WORKSPACE, null, "author");
    var first =
        create(WORKSPACE, Map.of("snapshotId", firstSnapshot.snapshotId(), "format", "csv"));
    var firstId = UUID.fromString((String) first.get("outputId"));
    var firstArtifact = artifactText(firstId);

    jdbc.update(
        """
        UPDATE rm_object SET fields = '{"name":"two","cost":2}'::jsonb, version = 2
        WHERE workspace_id = ? AND object_id = ?
        """,
        WORKSPACE,
        OBJECT);
    var secondSnapshot = snapshots.capture(WORKSPACE, null, "author");
    var second =
        create(WORKSPACE, Map.of("snapshotId", secondSnapshot.snapshotId(), "format", "csv"));

    assertNotEquals(first.get("contentHash"), second.get("contentHash"));
    assertEquals(firstArtifact, artifactText(firstId));
  }

  @Test
  void rejectsDirectWorkspaceRenderAndMissingSnapshotId() {
    var withoutSnapshot = post(WORKSPACE, Map.of("format", "html"));
    var directWorkspace =
        post(WORKSPACE, Map.of("workspaceId", WORKSPACE.toString(), "format", "html"));

    assertEquals(400, withoutSnapshot.getStatusCode().value());
    assertEquals(400, directWorkspace.getStatusCode().value());
  }

  @Test
  void isolatesWorkspacesAndRepositoryWritesOnlyOutputSnapshot() throws Exception {
    var snapshot = snapshots.capture(WORKSPACE, null, "author");
    var created =
        create(WORKSPACE, Map.of("snapshotId", snapshot.snapshotId(), "format", "markdown"));
    var id = UUID.fromString((String) created.get("outputId"));
    var other = http.getForEntity(base(OTHER) + "/outputs/" + id, Map.class);
    var source =
        Files.readString(Path.of("src/main/java/com/mnext/server/OutputSnapshotRepository.java"))
            .toLowerCase();

    assertEquals(400, other.getStatusCode().value());
    assertTrue(source.contains("insert into output_snapshot"));
    assertTrue(source.contains("snapshotrepository"));
    assertEquals(false, source.contains("kernelcommandservice"));
    assertEquals(false, source.contains("data_object"));
    assertEquals(false, source.contains("data_field_value"));
    assertEquals(false, source.contains("data_relation"));
    assertEquals(false, source.contains("update "));
    assertEquals(false, source.contains("delete from"));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> create(UUID workspace, Object body) {
    var response = post(workspace, body);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private org.springframework.http.ResponseEntity<Map> post(UUID workspace, Object body) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "renderer");
    return http.postForEntity(
        base(workspace) + "/outputs", new HttpEntity<>(body, headers), Map.class);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(UUID workspace, UUID outputId) {
    var response = http.getForEntity(base(workspace) + "/outputs/" + outputId, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private int list(UUID workspace) {
    var response = http.getForEntity(base(workspace) + "/outputs?size=50", Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return ((java.util.List<?>) response.getBody().get("items")).size();
  }

  private String artifactText(UUID outputId) {
    return jdbc.queryForObject(
        "SELECT encode(artifact, 'escape') FROM output_snapshot WHERE output_id = ?",
        String.class,
        outputId);
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
