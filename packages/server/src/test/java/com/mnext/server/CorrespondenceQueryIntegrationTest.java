package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
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
class CorrespondenceQueryIntegrationTest {
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

  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;
  @Autowired ReadModelProjection projection;
  @LocalServerPort int port;

  @Test
  void queriesCorrespondenceRelationsInBothDirections() throws Exception {
    var workspace = UUID.randomUUID();
    workspace(workspace);
    defineMeta(workspace);
    var busLinkType = objectType(workspace, "bus_link");
    var sysmlBlockType = objectType(workspace, "sysml_block");
    var realizes = relationType(workspace, "realizes");

    var link = createObject(workspace, busLinkType, "create-link", "CAN-A");
    var block = createObject(workspace, sysmlBlockType, "create-block", "Power Module");
    assertOk(
        command(
            workspace,
            envelope(
                "CreateRelation",
                workspace,
                "create-realizes",
                Map.of(
                    "relationTypeId",
                    realizes,
                    "sourceId",
                    link,
                    "targetId",
                    block,
                    "relationFields",
                    Map.of(),
                    "source",
                    Map.of("type", "manual")))));
    projectOutbox();

    var fromLink = correspondences(workspace, link, 0, 10);
    assertEquals(1, ((Number) fromLink.get("total")).intValue());
    assertCorrespondence(fromLink, block, "sysml_block", "Power Module", "out");

    var fromBlock = correspondences(workspace, block, 0, 10);
    assertEquals(1, ((Number) fromBlock.get("total")).intValue());
    assertCorrespondence(fromBlock, link, "bus_link", "CAN-A", "in");

    assertEquals(400, status(workspace, link, 0, 201));
  }

  private void defineMeta(UUID workspace) {
    assertOk(
        meta(
            workspace,
            envelope(
                "DefineObjectType",
                workspace,
                "define-bus-link",
                Map.of("code", "bus_link", "name", "Bus Link"))));
    assertOk(
        meta(
            workspace,
            envelope(
                "DefineObjectType",
                workspace,
                "define-sysml-block",
                Map.of("code", "sysml_block", "name", "SysML Block"))));
    var busLink = objectType(workspace, "bus_link");
    var sysmlBlock = objectType(workspace, "sysml_block");
    defineNameField(workspace, busLink, "define-bus-link-name");
    defineNameField(workspace, sysmlBlock, "define-sysml-block-name");
    assertOk(
        meta(
            workspace,
            envelope(
                "DefineRelationType",
                workspace,
                "define-realizes",
                Map.of(
                    "code",
                    "realizes",
                    "name",
                    "Realizes",
                    "sourceTypeId",
                    busLink,
                    "targetTypeId",
                    sysmlBlock,
                    "direction",
                    "directed",
                    "cardinality",
                    "many_to_many",
                    "semantics",
                    "weak",
                    "hierarchical",
                    false))));
    jdbc.update(
        "UPDATE object_type SET published = TRUE WHERE workspace_id = ? AND code IN (?, ?)",
        workspace,
        "bus_link",
        "sysml_block");
  }

  private void workspace(UUID workspace) {
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, ?, 'ACTIVE')",
        workspace,
        "Federated workspace");
  }

  private void defineNameField(UUID workspace, UUID objectType, String key) {
    assertOk(
        meta(
            workspace,
            envelope(
                "DefineFieldDef",
                workspace,
                key,
                Map.of(
                    "objectTypeId",
                    objectType,
                    "code",
                    "name",
                    "name",
                    "Name",
                    "dataType",
                    "string",
                    "required",
                    true))));
  }

  private UUID createObject(UUID workspace, UUID objectType, String key, String name) {
    var response =
        command(
            workspace,
            envelope(
                "CreateObject",
                workspace,
                key,
                Map.of(
                    "objectTypeId",
                    objectType,
                    "fields",
                    Map.of("name", name),
                    "source",
                    Map.of("type", "manual"))));
    assertOk(response);
    return createdObjectId(response.getBody());
  }

  @SuppressWarnings("unchecked")
  private void assertCorrespondence(
      Map<String, Object> page, UUID objectId, String objectType, String name, String direction) {
    var items = (List<Map<String, Object>>) page.get("items");
    assertEquals(1, items.size());
    var item = items.getFirst();
    assertEquals(objectId.toString(), item.get("objectId"));
    assertEquals(objectType, item.get("objectType"));
    assertEquals(direction, item.get("direction"));
    assertEquals(name, ((Map<?, ?>) item.get("fields")).get("name"));
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> command(UUID workspace, Object request) {
    return post(workspace, "/commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "fed-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + workspace + path,
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private Map<String, Object> envelope(
      String commandType, UUID workspace, String key, Map<String, Object> payload) {
    return Map.of(
        "commandType",
        commandType,
        "workspaceId",
        workspace.toString(),
        "correlationId",
        UUID.randomUUID().toString(),
        "idempotencyKey",
        key,
        "payload",
        payload);
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

  @SuppressWarnings("unchecked")
  private UUID createdObjectId(Map body) {
    for (var eventId : (List<String>) body.get("events")) {
      var objectId =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (objectId != null) return UUID.fromString(objectId);
    }
    throw new IllegalStateException("CreateObject 未产生 ObjectCreated 事件");
  }

  private void projectOutbox() throws Exception {
    var events =
        jdbc.queryForList(
            """
            SELECT payload::text FROM event_outbox
            ORDER BY CASE event_type
                WHEN 'ObjectCreated' THEN 1
                WHEN 'FieldChanged' THEN 2
                WHEN 'RelationCreated' THEN 3
                ELSE 9
              END,
              created_at,
              aggregate_id,
              sequence
            """,
            String.class);
    for (var payload : events) {
      projection.apply(mapper.readValue(payload, EventEnvelope.class));
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> correspondences(UUID workspace, UUID objectId, int page, int size) {
    var response = http.getForEntity(correspondenceUrl(workspace, objectId, page, size), Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private int status(UUID workspace, UUID objectId, int page, int size) {
    return http.getForEntity(correspondenceUrl(workspace, objectId, page, size), Map.class)
        .getStatusCode()
        .value();
  }

  private String correspondenceUrl(UUID workspace, UUID objectId, int page, int size) {
    return "http://localhost:"
        + port
        + "/workspaces/"
        + workspace
        + "/views/correspondences?objectId="
        + objectId
        + "&relationType=realizes&page="
        + page
        + "&size="
        + size;
  }
}
