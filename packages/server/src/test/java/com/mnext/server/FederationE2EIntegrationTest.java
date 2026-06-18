package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
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
class FederationE2EIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");

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
  @Autowired DerivedEvaluator derivedEvaluator;
  @LocalServerPort int port;

  @Test
  void sysmlToBusProjectionDerivationRuleAndCorrespondenceStayConsistent() throws Exception {
    var template = template("federation_profile");
    var version = templateVersion(template);
    defineFederatedProfile(version);
    assertOk(meta(AUTHOR, publishTemplate(version, "publish-fed-profile")));
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-fed-profile")));

    var sysmlBlock = objectType(workspace, "sysml_block");
    var connector = relationType(workspace, "uml_connector");
    var source = createSysmlBlock(workspace, sysmlBlock, "Source", 70, "create-source");
    var branchA = createSysmlBlock(workspace, sysmlBlock, "Branch A", 40, "create-branch-a");
    var branchB = createSysmlBlock(workspace, sysmlBlock, "Branch B", 20, "create-branch-b");
    assertOk(
        command(workspace, createRelation(workspace, connector, source, branchA, "connect-a")));
    assertOk(
        command(workspace, createRelation(workspace, connector, source, branchB, "connect-b")));
    projectOutbox();

    assertOk(
        meta(
            workspace,
            command("DefineTransformation", workspace, "define-sysml-to-bus", mapping())));
    assertOk(meta(workspace, command("RunTransformation", workspace, "run-sysml-to-bus-1", run())));
    projectOutbox();

    var sourceNode = objectByField(workspace, "bus_node", "name", "Source");
    var branchANode = objectByField(workspace, "bus_node", "name", "Branch A");
    var branchBNode = objectByField(workspace, "bus_node", "name", "Branch B");
    assertEquals(3, countObjects(workspace, "bus_node"));
    assertEquals(2, countRelations(workspace, "bus_link"));
    assertEquals(3, countRelations(workspace, "realizes"));
    assertCorrespondence(
        correspondences(workspace, sourceNode, 0, 10), source, "sysml_block", "in");
    assertCorrespondence(correspondences(workspace, source, 0, 10), sourceNode, "bus_node", "out");

    assertDecimal("130", derivedEvaluator.evaluate(workspace, sourceNode, "total_load"));
    assertDecimal("40", derivedEvaluator.evaluate(workspace, branchANode, "total_load"));
    assertDecimal("20", derivedEvaluator.evaluate(workspace, branchBNode, "total_load"));

    var runId = runId(rule(workspace, runRuleCheck(workspace, "run-bandwidth-check")));
    var results = checkResults(workspace, runId, 0, 10);
    assertEquals(1, ((Number) results.get("total")).intValue());
    assertCheckResult(results, sourceNode, "bus_node_bandwidth_exceeded", "130", "100");

    assertOk(meta(workspace, command("RunTransformation", workspace, "run-sysml-to-bus-2", run())));
    projectOutbox();

    assertEquals(3, countObjects(workspace, "bus_node"));
    assertEquals(2, countRelations(workspace, "bus_link"));
    assertEquals(3, countRelations(workspace, "realizes"));
  }

  private void defineFederatedProfile(UUID version) {
    defineObject(version, "sysml_block", "SysML Block", "define-sysml-block");
    defineObject(version, "bus_node", "Bus Node", "define-bus-node");
    var sysmlBlock = objectType(AUTHOR, "sysml_block");
    var busNode = objectType(AUTHOR, "bus_node");
    defineField(sysmlBlock, "name", "Name", "string", true, "define-sysml-name");
    defineField(sysmlBlock, "bandwidth", "Bandwidth", "number", true, "define-sysml-bandwidth");
    defineField(busNode, "name", "Name", "string", true, "define-bus-name");
    defineField(busNode, "capacity", "Capacity", "number", true, "define-bus-capacity");
    defineRelation(version, "uml_connector", "UML Connector", sysmlBlock, sysmlBlock);
    defineRelation(version, "bus_link", "Bus Link", busNode, busNode);
    defineRelation(version, "realizes", "Realizes", sysmlBlock, busNode);
    defineDerived(version, busNode);
    defineBandwidthRule(version);
  }

  private void defineObject(UUID version, String code, String name, String key) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineObjectType",
                AUTHOR,
                key,
                Map.of("templateVersionId", version, "code", code, "name", name))));
  }

  private void defineField(
      UUID objectType, String code, String name, String dataType, boolean required, String key) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineFieldDef",
                AUTHOR,
                key,
                Map.of(
                    "objectTypeId",
                    objectType,
                    "code",
                    code,
                    "name",
                    name,
                    "dataType",
                    dataType,
                    "required",
                    required))));
  }

  private void defineRelation(UUID version, String code, String name, UUID source, UUID target) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineRelationType",
                AUTHOR,
                "define-" + code,
                Map.of(
                    "code",
                    code,
                    "name",
                    name,
                    "sourceTypeId",
                    source,
                    "targetTypeId",
                    target,
                    "direction",
                    "directed",
                    "cardinality",
                    "many_to_many",
                    "semantics",
                    "weak",
                    "hierarchical",
                    false))));
    attachRelationTypeToTemplateVersion(version, code);
  }

  private void defineDerived(UUID version, UUID busNode) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineDerivedField",
                AUTHOR,
                "define-total-load",
                Map.of(
                    "templateVersionId",
                    version,
                    "objectTypeId",
                    busNode,
                    "code",
                    "total_load",
                    "name",
                    "Total Load",
                    "resultType",
                    "number",
                    "derivation",
                    "field('capacity') + sum(traverse('bus_link','out'),'capacity')"))));
  }

  private void defineBandwidthRule(UUID version) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateVersionId", version);
    payload.put("ruleCode", "bus_node_bandwidth_exceeded");
    payload.put("scope", Map.of("objectTypeCode", "bus_node"));
    payload.put("severity", "BLOCK");
    payload.put("when", "field('total_load') > 100");
    payload.put("message", "总线节点负载 ${field('total_load')} 超阈值 100");
    payload.put("lightweight", false);
    assertOk(rule(AUTHOR, command("DefineRule", AUTHOR, "define-bus-bandwidth-rule", payload)));
    assertOk(
        rule(
            AUTHOR,
            command(
                "PublishRule",
                AUTHOR,
                "publish-bus-bandwidth-rule",
                Map.of("ruleCode", "bus_node_bandwidth_exceeded"))));
  }

  private Map<String, Object> mapping() {
    return Map.of(
        "code",
        "sysml_to_bus",
        "name",
        "SysML to Bus",
        "correspondenceRelationCode",
        "realizes",
        "objectMappings",
        List.of(
            Map.of(
                "sourceTypeCode",
                "sysml_block",
                "targetTypeCode",
                "bus_node",
                "fieldMappings",
                List.of(
                    Map.of("targetFieldCode", "name", "expression", "field('name')"),
                    Map.of("targetFieldCode", "capacity", "expression", "field('bandwidth')")))),
        "relationMappings",
        List.of(Map.of("sourceRelationCode", "uml_connector", "targetRelationCode", "bus_link")));
  }

  private Map<String, Object> run() {
    return Map.of("transformationCode", "sysml_to_bus");
  }

  private UUID createSysmlBlock(
      UUID workspace, UUID objectType, String name, int bandwidth, String key) {
    var response =
        command(
            workspace,
            createObject(workspace, objectType, key, Map.of("name", name, "bandwidth", bandwidth)));
    assertOk(response);
    return createdObjectId(response.getBody());
  }

  private Map<String, Object> createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    return command(
        "CreateObject",
        workspace,
        key,
        Map.of("objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
  }

  private Map<String, Object> createRelation(
      UUID workspace, UUID relationType, UUID source, UUID target, String key) {
    return command(
        "CreateRelation",
        workspace,
        key,
        Map.of(
            "relationTypeId",
            relationType,
            "sourceId",
            source,
            "targetId",
            target,
            "relationFields",
            Map.of(),
            "source",
            Map.of("type", "manual")));
  }

  private Map<String, Object> runRuleCheck(UUID workspace, String key) {
    return command(
        "RunRuleCheck", workspace, key, Map.of("scope", Map.of("objectTypeCode", "bus_node")));
  }

  private UUID template(String code) {
    var template = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template (id, code, name, created_by, created_at)
        VALUES (?, ?, ?, 'test', CURRENT_TIMESTAMP)
        """,
        template,
        code + "_" + template.toString().substring(0, 8),
        code);
    return template;
  }

  private UUID templateVersion(UUID template) {
    var version = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template_version (id, template_id, version, status)
        VALUES (?, ?, 1, 'draft')
        """,
        version,
        template);
    return version;
  }

  private Map<String, Object> publishTemplate(UUID version, String key) {
    return command("PublishTemplateVersion", AUTHOR, key, Map.of("templateVersionId", version));
  }

  private Map<String, Object> instantiate(UUID template, UUID workspace, String key) {
    return command(
        "InstantiateWorkspace",
        AUTHOR,
        key,
        Map.of(
            "templateId",
            template,
            "version",
            1,
            "newWorkspaceId",
            workspace,
            "workspaceName",
            "Federated Project"));
  }

  private void attachRelationTypeToTemplateVersion(UUID version, String code) {
    jdbc.update(
        """
        UPDATE relation_type
        SET template_version_id = ?
        WHERE workspace_id = ? AND code = ?
        """,
        version,
        AUTHOR,
        code);
  }

  private Map<String, Object> command(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", workspace);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", key);
    request.put("commandType", type);
    request.put("payload", payload);
    return request;
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> rule(UUID workspace, Object request) {
    return post(workspace, "/rule-commands", request);
  }

  private ResponseEntity<Map> command(UUID workspace, Object request) {
    return post(workspace, "/commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "fed-e2e-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + workspace + path,
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private String runId(ResponseEntity<Map> response) {
    assertOk(response);
    return (String) ((List<?>) response.getBody().get("events")).getFirst();
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

  private UUID objectByField(UUID workspace, String typeCode, String fieldCode, String value) {
    return jdbc.queryForObject(
        """
        SELECT object.id
        FROM data_object object
        JOIN object_type type ON type.id = object.object_type_id
        JOIN data_field_value field_value ON field_value.object_id = object.id
        JOIN field_def field ON field.id = field_value.field_def_id
        WHERE object.workspace_id = ?
          AND type.code = ?
          AND field.code = ?
          AND field_value.value #>> '{}' = ?
        ORDER BY object.created_at DESC
        LIMIT 1
        """,
        UUID.class,
        workspace,
        typeCode,
        fieldCode,
        value);
  }

  private int countObjects(UUID workspace, String typeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM data_object object
        JOIN object_type type ON type.id = object.object_type_id
        WHERE object.workspace_id = ? AND type.code = ?
        """,
        Integer.class,
        workspace,
        typeCode);
  }

  private int countRelations(UUID workspace, String relationCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM data_relation relation
        JOIN relation_type type ON type.id = relation.relation_type_id
        WHERE relation.workspace_id = ? AND type.code = ?
        """,
        Integer.class,
        workspace,
        relationCode);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> correspondences(UUID workspace, UUID objectId, int page, int size) {
    var response =
        http.getForEntity(
            "http://localhost:"
                + port
                + "/workspaces/"
                + workspace
                + "/views/correspondences?objectId="
                + objectId
                + "&relationType=realizes&page="
                + page
                + "&size="
                + size,
            Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private void assertCorrespondence(
      Map<String, Object> page, UUID objectId, String objectType, String direction) {
    assertEquals(1, ((Number) page.get("total")).intValue());
    var item = ((List<Map<String, Object>>) page.get("items")).getFirst();
    assertEquals(objectId.toString(), item.get("objectId"));
    assertEquals(objectType, item.get("objectType"));
    assertEquals(direction, item.get("direction"));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> checkResults(UUID workspace, String runId, int page, int size) {
    var response =
        http.getForEntity(
            "http://localhost:"
                + port
                + "/workspaces/"
                + workspace
                + "/views/check-results?runId="
                + runId
                + "&page="
                + page
                + "&size="
                + size,
            Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private void assertCheckResult(
      Map<String, Object> page, UUID objectId, String ruleCode, String load, String threshold) {
    var item = ((List<Map<String, Object>>) page.get("items")).getFirst();
    assertEquals(objectId.toString(), item.get("objectId"));
    assertEquals(ruleCode, item.get("ruleCode"));
    assertEquals("BLOCK", item.get("severity"));
    assertTrue(((String) item.get("message")).contains(load), String.valueOf(item));
    assertTrue(((String) item.get("message")).contains(threshold), String.valueOf(item));
  }

  private void assertDecimal(String expected, Object actual) {
    assertTrue(actual instanceof BigDecimal, "expected BigDecimal but got " + actual);
    assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) actual));
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
}
