package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.reqif.ReqIfCodec;
import com.mnext.engines.exchange.reqif.ReqIfMapper;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
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
class ReqIfIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
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

  @Autowired ExchangeController controller;
  @Autowired SnapshotRepository snapshots;
  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @LocalServerPort int port;
  private final ReqIfCodec codec = new ReqIfCodec();

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM snapshot");
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
        """
        INSERT INTO data_object
          (id, workspace_id, object_type_id, status, version,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, '22222222-2222-4222-8222-222222222222', 'DRAFT', 1,
          'seed', 'seed', now(), now())
        """,
        OBJECT,
        WORKSPACE);
    insertField("33333333-3333-4333-8333-333333333331", "\"one\"");
    insertField("33333333-3333-4333-8333-333333333332", "1");
    insertReadModel(OBJECT, "{\"name\":\"one\",\"cost\":1}", 1);
  }

  @Test
  void exportsFromCurrentAndSnapshotPreviewsAndAppliesThroughCommands() {
    var snapshot = snapshots.capture(WORKSPACE, null, "author");
    var currentXml =
        http.getForEntity(
            reqifBase() + "/export?base=current&objectType=demo_object", String.class);
    var snapshotXml =
        http.getForEntity(
            reqifBase()
                + "/export?base=snapshot:"
                + snapshot.snapshotId()
                + "&objectType=demo_object",
            String.class);

    var preview =
        controller.previewReqIf(WORKSPACE, "snapshot:" + snapshot.snapshotId(), targetReqIf(true));
    var applied =
        controller.applyReqIf(
            WORKSPACE, "importer", new ReqIfApplyRequest(targetReqIf(true), false));

    assertEquals(200, currentXml.getStatusCode().value());
    assertEquals(200, snapshotXml.getStatusCode().value());
    assertTrue(snapshotXml.getBody().contains("SPEC-OBJECT"));
    assertEquals(1, preview.summary().objectsAdded());
    assertEquals(1, preview.summary().objectsChanged());
    assertEquals(1, preview.summary().relationsAdded());
    assertEquals(3, applied.applied().size());
    assertEquals(2, count("data_object"));
    assertEquals(1, count("data_relation"));
    assertEquals(2L, objectVersion());
  }

  @Test
  void fieldConflictReturnsUnappliedItem() {
    jdbc.update("UPDATE data_object SET version = 2 WHERE id = ?", OBJECT);
    jdbc.update(
        """
        UPDATE data_field_value SET value = '9'::jsonb, version = 2
        WHERE object_id = ? AND field_def_id = '33333333-3333-4333-8333-333333333332'
        """,
        OBJECT);

    var result =
        controller.applyReqIf(
            WORKSPACE, "importer", new ReqIfApplyRequest(targetReqIf(false), false));

    assertEquals("KERNEL-409-VERSION-CONFLICT", result.unapplied().getFirst().error().code());
    assertEquals("9", cost());
  }

  @Test
  void removedObjectsAreNotDeletedByDefault() {
    var emptyReqIf =
        codec.serialize(ReqIfMapper.toReqIf("empty", null, new DataSet(List.of(), List.of())));

    var result =
        controller.applyReqIf(WORKSPACE, "importer", new ReqIfApplyRequest(emptyReqIf, false));

    assertEquals(0, result.applied().size());
    assertEquals(1, count("data_object"));
  }

  private String targetReqIf(boolean includeNewObject) {
    return codec.serialize(ReqIfMapper.toReqIf("target", null, target(includeNewObject)));
  }

  private static DataSet target(boolean includeNewObject) {
    var objects = new java.util.ArrayList<DataObject>();
    objects.add(
        new DataObject(
            OBJECT.toString(), "demo_object", Map.of("name", "one", "cost", 2), "DRAFT", 1));
    if (includeNewObject) {
      objects.add(
          new DataObject("REQ-2", "demo_object", Map.of("name", "two", "cost", 3), "DRAFT", 1));
    }
    var relations =
        includeNewObject
            ? List.of(new DataRelation("rel-1", "depends_on", OBJECT.toString(), "REQ-2", Map.of()))
            : List.<DataRelation>of();
    return new DataSet(objects, relations);
  }

  private void insertField(String fieldId, String value) {
    jdbc.update(
        """
        INSERT INTO data_field_value
          (object_id, field_def_id, value, version, created_by, updated_by, created_at, updated_at)
        VALUES (?, CAST(? AS uuid), CAST(? AS jsonb), 1, 'seed', 'seed', now(), now())
        """,
        OBJECT,
        fieldId,
        value);
  }

  private void insertReadModel(UUID objectId, String fields, long version) {
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, 'demo_object', 'DRAFT', ?, CAST(? AS jsonb), now())
        """,
        WORKSPACE,
        objectId,
        version,
        fields);
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private String reqifBase() {
    return "/workspaces/" + WORKSPACE + "/exchange/reqif";
  }

  private long objectVersion() {
    return jdbc.queryForObject("SELECT version FROM data_object WHERE id = ?", Long.class, OBJECT);
  }

  private String cost() {
    return jdbc.queryForObject(
        "SELECT value::text FROM data_field_value WHERE object_id = ?"
            + " AND field_def_id = '33333333-3333-4333-8333-333333333332'",
        String.class,
        OBJECT);
  }
}
