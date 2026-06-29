package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
    properties = {
      "mnext.outbox.enabled=false",
      "mnext.readmodel.enabled=false",
      "mnext.sim.async.enabled=false"
    })
class SimulationIntegrationTest {
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
  @Autowired SimulationRunner runner;
  @Autowired SimulationRunRepository runs;
  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @LocalServerPort int port;

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM simulation_run");
    jdbc.update("DELETE FROM snapshot");
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
    insertObject(WORKSPACE, OBJECT, 1, "{\"name\":\"one\",\"cost\":1}");
  }

  @Test
  void enqueueDrainCompletesAndKeepsStableHash() {
    var snapshot = snapshots.capture(WORKSPACE, null, "author");
    var first =
        create(
            WORKSPACE,
            Map.of(
                "snapshotId",
                snapshot.snapshotId(),
                "engineId",
                "echo",
                "config",
                Map.of("step", 1)));

    assertEquals("QUEUED", first.get("status"));
    assertEquals(1, runner.drain());
    var runId = UUID.fromString((String) first.get("runId"));
    var completed = get(WORKSPACE, runId);
    assertEquals("COMPLETED", completed.get("status"));
    assertEquals(64, ((String) completed.get("resultHash")).length());
    assertEquals("sim-user", completed.get("createdBy"));
    assertNotNull(completed.get("startedAt"));
    assertNotNull(completed.get("completedAt"));
    assertEquals(1, ((Map<?, ?>) completed.get("result")).get("objectCount"));
    assertEquals(0, countSeries(runId));

    var second =
        create(
            WORKSPACE,
            Map.of(
                "engineId",
                "echo",
                "snapshotId",
                snapshot.snapshotId(),
                "config",
                Map.of("step", 1)));
    assertEquals(1, runner.drain());
    var secondCompleted = get(WORKSPACE, UUID.fromString((String) second.get("runId")));

    assertEquals(completed.get("resultHash"), secondCompleted.get("resultHash"));
    assertEquals(completed.get("configHash"), secondCompleted.get("configHash"));
    assertEquals(2, list(WORKSPACE));
  }

  @Test
  void completedRunPersistsSeriesAndViewEndpointsPageDownsampledPoints() {
    var snapshot = snapshots.capture(WORKSPACE, null, "author");
    var run = create(WORKSPACE, Map.of("snapshotId", snapshot.snapshotId(), "engineId", "echo"));
    var runId = UUID.fromString((String) run.get("runId"));

    runs.start(runId);
    runs.complete(
        runId,
        Map.of(
            "series",
            List.of(
                point(OBJECT, "temperature", 0, 20.0d),
                point(OBJECT, "temperature", 10, 21.0d),
                point(OBJECT, "temperature", 20, 22.0d),
                point(OBJECT, "temperature", 30, 23.0d),
                point(OBJECT, "state", 30, Map.of("mode", "safe")))));

    assertEquals(5, countSeries(runId));
    var runsPage = getView("/views/sim-runs?size=10");
    assertEquals(1, ((List<?>) runsPage.get("items")).size());
    var summary = (Map<?, ?>) ((List<?>) runsPage.get("items")).getFirst();
    assertEquals(runId.toString(), summary.get("runId"));
    assertNull(summary.get("result"));

    var series =
        getView(
            "/views/sim-runs/"
                + runId
                + "/series?object="
                + OBJECT
                + "&field=temperature&from=0&to=30&downsample=2&page=0&size=2");
    assertEquals(2, series.get("total"));
    var items = (List<?>) series.get("items");
    assertEquals(2, items.size());
    assertEquals(0.0d, ((Number) ((Map<?, ?>) items.get(0)).get("t")).doubleValue());
    assertEquals(20.0d, ((Number) ((Map<?, ?>) items.get(0)).get("value")).doubleValue());
    assertEquals(20.0d, ((Number) ((Map<?, ?>) items.get(1)).get("t")).doubleValue());
    assertEquals(22.0d, ((Number) ((Map<?, ?>) items.get(1)).get("value")).doubleValue());

    var state = getView("/views/sim-runs/" + runId + "/series?field=state");
    var statePoint = (Map<?, ?>) ((List<?>) state.get("items")).getFirst();
    assertNull(statePoint.get("value"));
    assertEquals("safe", ((Map<?, ?>) statePoint.get("valueJson")).get("mode"));
  }

  @Test
  void rejectsMissingSnapshotUnknownEngineAndDirectWorkspaceInput() {
    var snapshot = snapshots.capture(WORKSPACE, null, "author");
    var missingSnapshot =
        post(WORKSPACE, Map.of("engineId", "echo", "snapshotId", UUID.randomUUID()));
    var unknownEngine =
        post(WORKSPACE, Map.of("engineId", "missing", "snapshotId", snapshot.snapshotId()));
    var noSnapshot = post(WORKSPACE, Map.of("engineId", "echo"));
    var directWorkspace =
        post(
            WORKSPACE,
            Map.of(
                "engineId", "echo", "snapshotId", snapshot.snapshotId(), "workspaceId", WORKSPACE));

    assertEquals(404, missingSnapshot.getStatusCode().value());
    assertEquals("SIM-404-SNAPSHOT-NOT-FOUND", errorCode(missingSnapshot));
    assertEquals(422, unknownEngine.getStatusCode().value());
    assertEquals("SIM-422-ENGINE-NOT-FOUND", errorCode(unknownEngine));
    assertEquals(400, noSnapshot.getStatusCode().value());
    assertEquals(400, directWorkspace.getStatusCode().value());
  }

  @Test
  void illegalStateTransitionReportsSimulationConflict() {
    var snapshot = snapshots.capture(WORKSPACE, null, "author");
    var run = create(WORKSPACE, Map.of("snapshotId", snapshot.snapshotId(), "engineId", "echo"));
    var runId = UUID.fromString((String) run.get("runId"));

    runs.start(runId);
    var failure =
        org.junit.jupiter.api.Assertions.assertThrows(
            SimulationException.class, () -> runs.start(runId));

    assertEquals("SIM-409-INVALID-STATE-TRANSITION", failure.code());
  }

  @Test
  void isolatesWorkspacesAndRepositoryDoesNotTouchMasterData() throws Exception {
    var snapshot = snapshots.capture(WORKSPACE, null, "author");
    var run = create(WORKSPACE, Map.of("snapshotId", snapshot.snapshotId(), "engineId", "echo"));
    var other = http.getForEntity(base(OTHER) + "/simulations/" + run.get("runId"), Map.class);
    var source =
        Files.readString(Path.of("src/main/java/com/mnext/server/SimulationRunRepository.java"))
            .toLowerCase();

    assertEquals(400, other.getStatusCode().value());
    assertTrue(source.contains("insert into simulation_run"));
    assertTrue(source.contains("snapshotrepository"));
    assertEquals(false, source.contains("kernelcommandservice"));
    assertEquals(false, source.contains("event_outbox"));
    assertEquals(false, source.contains("data_object"));
    assertEquals(false, source.contains("data_field_value"));
    assertEquals(false, source.contains("data_relation"));
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
    headers.set("X-Actor-Id", "sim-user");
    return http.postForEntity(
        base(workspace) + "/simulations", new HttpEntity<>(body, headers), Map.class);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(UUID workspace, UUID runId) {
    var response = http.getForEntity(base(workspace) + "/simulations/" + runId, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private int list(UUID workspace) {
    var response = http.getForEntity(base(workspace) + "/simulations?size=50", Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return ((java.util.List<?>) response.getBody().get("items")).size();
  }

  private int countSeries(UUID runId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM sim_result_series WHERE run_id = ?", Integer.class, runId);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> getView(String path) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", "sim-user");
    var response =
        http.exchange(
            base(WORKSPACE) + path,
            org.springframework.http.HttpMethod.GET,
            new HttpEntity<>(headers),
            Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private Map<String, Object> point(UUID objectId, String fieldCode, double time, Object value) {
    return Map.of(
        "objectId", objectId.toString(), "fieldCode", fieldCode, "t", time, "value", value);
  }

  private String errorCode(org.springframework.http.ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
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
