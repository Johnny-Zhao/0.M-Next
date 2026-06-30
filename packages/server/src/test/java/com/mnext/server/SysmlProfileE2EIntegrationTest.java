package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
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
class SysmlProfileE2EIntegrationTest {
  private static final String XMI_NS = "http" + "://www.omg.org/XMI";
  private static final String UML_NS = "http" + "://www.eclipse.org/uml2/5.0.0/UML";
  private static final String SYSML_NS = "http" + "://www.omg.org/spec/SysML/20100301/SysML";

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
  void sysmlProfileImportsXmiAndEnforcesRules() throws Exception {
    var author = UUID.randomUUID();
    workspace(author, "SysML Author");
    var template = template("sysml_profile");
    var version = templateVersion(template);
    defineProfile(version, author);
    assertOk(meta(author, publishTemplate(version, "publish-sysml-profile", author)));
    var workspace = UUID.randomUUID();
    assertOk(meta(author, instantiate(template, workspace, "instantiate-sysml-profile", author)));

    var imported =
        post(
            workspace,
            "/exchange/sysml-xmi/apply",
            Map.of("payload", sampleXmi(), "confirmRemovals", false));
    assertEquals(200, imported.getStatusCode().value(), String.valueOf(imported.getBody()));
    assertTrue(list(imported.getBody(), "unapplied").isEmpty(), String.valueOf(imported.getBody()));
    assertEquals(3, list(imported.getBody(), "applied").size());
    assertXmiIdentityBaseline(workspace, sampleXmi(), 1);
    projectOutbox();

    assertImportedObjectsAndAssociation(workspace);
    assertObjectTypesViewExposesInheritedName(workspace);
    var refreshed = sampleXmi().replace("Engine shall be safe", "Engine shall remain safe");
    var reimported =
        post(
            workspace,
            "/exchange/sysml-xmi/apply",
            Map.of("payload", refreshed, "confirmRemovals", false));
    assertEquals(200, reimported.getStatusCode().value(), String.valueOf(reimported.getBody()));
    assertTrue(
        list(reimported.getBody(), "unapplied").isEmpty(), String.valueOf(reimported.getBody()));
    assertXmiIdentityBaseline(workspace, refreshed, 2);

    var rejected =
        post(
            workspace,
            "/commands",
            createObject(
                workspace,
                objectType(workspace, "sysml_requirement"),
                "create-empty-requirement",
                Map.of("name", "Incomplete", "req_id", "REQ-BAD", "text", "")));
    assertEquals(422, rejected.getStatusCode().value(), String.valueOf(rejected.getBody()));
    assertEquals("RULE-422-RULE-VIOLATION", errorCode(rejected));
  }

  @Test
  void sysmlProjectSetResolvesInternalHrefsAndKeepsExternalPayloads() throws Exception {
    var author = UUID.randomUUID();
    workspace(author, "SysML Project Set Author");
    var template = template("sysml_project_set");
    var version = templateVersion(template);
    defineProfile(version, author);
    assertOk(meta(author, publishTemplate(version, "publish-sysml-project-set", author)));
    var workspace = UUID.randomUUID();
    assertOk(
        meta(author, instantiate(template, workspace, "instantiate-sysml-project-set", author)));

    var imported =
        post(
            workspace,
            "/exchange/sysml-xmi/project-set/apply",
            Map.of(
                "confirmRemovals",
                false,
                "documents",
                List.of(
                    Map.of("projectRef", "main.xmi", "payload", projectSetMainXmi()),
                    Map.of("projectRef", "lib.xmi", "payload", projectSetLibraryXmi()))));

    assertEquals(200, imported.getStatusCode().value(), String.valueOf(imported.getBody()));
    assertEquals(1, list(imported.getBody(), "resolvedReferences").size());
    assertEquals(1, list(imported.getBody(), "unresolvedReferences").size());
    assertProjectSetIdentityBaseline(workspace);
    assertProjectSetRelation(workspace);
    assertCustomStereotypePreserved(workspace);
  }

  private void defineProfile(UUID version, UUID author) {
    var suffix = "-" + version.toString().substring(0, 8);
    assertOk(
        meta(
            author,
            command(
                "DefineValueType",
                author,
                "define-sysml-id" + suffix,
                Map.of(
                    "templateVersionId", version,
                    "code", "sysml_id",
                    "name", "SysML ID",
                    "basePrimitive", "text",
                    "parentValueTypeCode", "text"))));
    assertOk(
        meta(
            author,
            command(
                "DefineObjectType",
                author,
                "define-uml-class" + suffix,
                Map.of(
                    "templateVersionId", version,
                    "code", "uml_class",
                    "name", "UML Class"))));
    assertOk(
        meta(
            author,
            command(
                "DefineObjectType",
                author,
                "define-sysml-block" + suffix,
                Map.of(
                    "templateVersionId", version,
                    "code", "sysml_block",
                    "name", "SysML Block",
                    "parentTypeCode", "uml_class"))));
    assertOk(
        meta(
            author,
            command(
                "DefineObjectType",
                author,
                "define-sysml-requirement" + suffix,
                Map.of(
                    "templateVersionId", version,
                    "code", "sysml_requirement",
                    "name", "SysML Requirement",
                    "parentTypeCode", "uml_class"))));
    var umlClass = objectType(author, "uml_class", version);
    var requirement = objectType(author, "sysml_requirement", version);
    defineField(author, umlClass, "name", "Name", "string", null, true, "define-uml-name" + suffix);
    defineField(
        author,
        umlClass,
        "uml_stereotype",
        "UML Stereotype",
        "string",
        null,
        false,
        "define-uml-stereotype" + suffix);
    defineField(
        author,
        requirement,
        "req_id",
        "Requirement ID",
        null,
        "sysml_id",
        false,
        "define-req-id" + suffix);
    defineField(
        author, requirement, "text", "Text", "text", null, true, "define-req-text" + suffix);
    assertOk(
        meta(
            author,
            command(
                "DefineRelationType",
                author,
                "define-uml-association" + suffix,
                Map.of(
                    "code", "uml_association",
                    "name", "UML Association",
                    "sourceTypeId", umlClass,
                    "targetTypeId", umlClass,
                    "direction", "directed",
                    "cardinality", "many_to_many",
                    "semantics", "weak",
                    "hierarchical", false))));
    attachRelationTypeToTemplateVersion(author, version, "uml_association");
    defineRequirementRule(version, suffix, author);
  }

  private void attachRelationTypeToTemplateVersion(UUID workspace, UUID version, String code) {
    jdbc.update(
        """
        UPDATE relation_type
        SET template_version_id = ?
        WHERE workspace_id = ? AND code = ?
          AND template_version_id IS NULL
        """,
        version,
        workspace,
        code);
  }

  private void defineField(
      UUID author,
      UUID objectType,
      String code,
      String name,
      String dataType,
      String valueTypeCode,
      boolean required,
      String key) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeId", objectType);
    payload.put("code", code);
    payload.put("name", name);
    if (dataType != null) payload.put("dataType", dataType);
    if (valueTypeCode != null) payload.put("valueTypeCode", valueTypeCode);
    payload.put("required", required);
    assertOk(meta(author, command("DefineFieldDef", author, key, payload)));
  }

  private void defineRequirementRule(UUID version, String suffix, UUID author) {
    var ruleCode = "requirement_text_required_" + version.toString().substring(0, 8);
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateVersionId", version);
    payload.put("ruleCode", ruleCode);
    payload.put("scope", Map.of("objectTypeCode", "sysml_requirement", "fieldCode", "text"));
    payload.put("severity", "BLOCK");
    payload.put("when", "isBlank(field('text'))");
    payload.put("message", "Requirement text is required");
    payload.put("lightweight", true);
    assertOk(
        rule(
            author,
            command("DefineRule", author, "define-requirement-text-rule" + suffix, payload)));
    assertOk(
        rule(
            author,
            command(
                "PublishRule",
                author,
                "publish-requirement-text-rule" + suffix,
                Map.of("ruleCode", ruleCode))));
  }

  private void assertImportedObjectsAndAssociation(UUID workspace) {
    assertEquals(
        1,
        count(
            "data_object object JOIN object_type type ON type.id = object.object_type_id WHERE object.workspace_id = '"
                + workspace
                + "' AND type.code = 'sysml_block'"));
    assertEquals(
        1,
        count(
            "data_object object JOIN object_type type ON type.id = object.object_type_id WHERE object.workspace_id = '"
                + workspace
                + "' AND type.code = 'sysml_requirement'"));
    assertEquals(
        "REQ-1",
        value(
            """
            SELECT value.value #>> '{}'
            FROM data_field_value value
            JOIN field_def field ON field.id = value.field_def_id
            JOIN data_object object ON object.id = value.object_id
            WHERE object.workspace_id = ? AND field.code = 'req_id'
            """,
            workspace));
    assertEquals(
        "Engine shall be safe",
        value(
            """
            SELECT value.value #>> '{}'
            FROM data_field_value value
            JOIN field_def field ON field.id = value.field_def_id
            JOIN data_object object ON object.id = value.object_id
            WHERE object.workspace_id = ? AND field.code = 'text'
            """,
            workspace));
    assertEquals(
        1,
        count(
            """
            data_relation relation
            JOIN relation_type relation_type ON relation_type.id = relation.relation_type_id
            JOIN data_object source ON source.id = relation.source_id
            JOIN object_type source_type ON source_type.id = source.object_type_id
            JOIN data_object target ON target.id = relation.target_id
            JOIN object_type target_type ON target_type.id = target.object_type_id
            WHERE relation.workspace_id = '%s'
              AND relation_type.code = 'uml_association'
              AND source_type.code = 'sysml_block'
              AND target_type.code = 'sysml_requirement'
            """
                .formatted(workspace)));
  }

  private void assertObjectTypesViewExposesInheritedName(UUID workspace) {
    var types = get(workspace, "/views/object-types");
    var block = fields(types, "sysml_block");
    var requirement = fields(types, "sysml_requirement");
    assertTrue(block.containsKey("name"));
    assertTrue(requirement.containsKey("name"));
    assertTrue(requirement.containsKey("req_id"));
    assertTrue(requirement.containsKey("text"));
  }

  private void assertXmiIdentityBaseline(UUID workspace, String content, int version) {
    assertEquals(
        3,
        count(
            """
            xmi_identity
            WHERE workspace_id = '%s'
              AND project_ref = 'default'
              AND xmi_id IN ('A1', 'B1', 'R1')
            """
                .formatted(workspace)));
    assertEquals(
        3,
        count(
            """
            (SELECT DISTINCT xmi_id FROM xmi_identity
             WHERE workspace_id = '%s' AND project_ref = 'default') identities
            """
                .formatted(workspace)));
    assertEquals(
        version,
        value(
            """
            SELECT version FROM xmi_baseline_document
            WHERE workspace_id = ? AND project_ref = 'default'
            """,
            workspace));
    assertEquals(
        content,
        value(
            """
            SELECT content FROM xmi_baseline_document
            WHERE workspace_id = ? AND project_ref = 'default'
            """,
            workspace));
  }

  private void assertProjectSetIdentityBaseline(UUID workspace) {
    assertEquals(
        2,
        count(
            """
            xmi_baseline_document
            WHERE workspace_id = '%s'
              AND project_ref IN ('main.xmi', 'lib.xmi')
            """
                .formatted(workspace)));
    assertTrue(
        String.valueOf(
                value(
                    """
                    SELECT content FROM xmi_baseline_document
                    WHERE workspace_id = ? AND project_ref = 'main.xmi'
                    """,
                    workspace))
            .contains("outside.xmi#EXT"));
    assertTrue(
        String.valueOf(
                value(
                    """
                    SELECT content FROM xmi_baseline_document
                    WHERE workspace_id = ? AND project_ref = 'lib.xmi'
                    """,
                    workspace))
            .contains("custom:SpecialThing"));
    assertEquals(
        1,
        count(
            """
            xmi_identity
            WHERE workspace_id = '%s'
              AND project_ref = 'main.xmi'
              AND xmi_id = 'A-lib'
              AND platform_kind = 'relation'
            """
                .formatted(workspace)));
    assertEquals(
        1,
        count(
            """
            xmi_identity
            WHERE workspace_id = '%s'
              AND project_ref = 'lib.xmi'
              AND xmi_id = 'C1'
              AND platform_kind = 'object'
            """
                .formatted(workspace)));
  }

  private void assertProjectSetRelation(UUID workspace) {
    assertEquals(
        1,
        count(
            """
            data_relation relation
            JOIN relation_type relation_type ON relation_type.id = relation.relation_type_id
            JOIN xmi_identity source_identity
              ON source_identity.platform_id = relation.source_id
             AND source_identity.workspace_id = relation.workspace_id
             AND source_identity.project_ref = 'main.xmi'
             AND source_identity.xmi_id = 'B1'
            JOIN xmi_identity target_identity
              ON target_identity.platform_id = relation.target_id
             AND target_identity.workspace_id = relation.workspace_id
             AND target_identity.project_ref = 'lib.xmi'
             AND target_identity.xmi_id = 'L1'
            WHERE relation.workspace_id = '%s'
              AND relation_type.code = 'uml_association'
            """
                .formatted(workspace)));
  }

  private void assertCustomStereotypePreserved(UUID workspace) {
    assertEquals(
        "SpecialThing",
        value(
            """
            SELECT value.value #>> '{}'
            FROM data_field_value value
            JOIN field_def field ON field.id = value.field_def_id
            JOIN xmi_identity identity ON identity.platform_id = value.object_id
            WHERE identity.workspace_id = ?
              AND identity.project_ref = 'lib.xmi'
              AND identity.xmi_id = 'C1'
              AND field.code = 'uml_stereotype'
            """,
            workspace));
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

  private void workspace(UUID workspace, String name) {
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, ?, 'ACTIVE')", workspace, name);
    jdbc.update(
        """
        INSERT INTO value_type (id, workspace_id, code, name, base_primitive, published)
        SELECT gen_random_uuid(), ?, code, name, code, TRUE
        FROM (VALUES
          ('string', 'String'),
          ('text', 'Text'),
          ('integer', 'Integer'),
          ('number', 'Number'),
          ('boolean', 'Boolean'),
          ('date', 'Date'),
          ('datetime', 'Datetime'),
          ('enum', 'Enum'),
          ('ref', 'Reference'),
          ('json', 'Json')
        ) root(code, name)
        """,
        workspace);
  }

  private Map<String, Object> publishTemplate(UUID version, String key, UUID author) {
    return command("PublishTemplateVersion", author, key, Map.of("templateVersionId", version));
  }

  private Map<String, Object> instantiate(UUID template, UUID workspace, String key, UUID author) {
    return command(
        "InstantiateWorkspace",
        author,
        key,
        Map.of(
            "templateId",
            template,
            "version",
            1,
            "newWorkspaceId",
            workspace,
            "workspaceName",
            "SysML Project"));
  }

  private Map<String, Object> createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    return command(
        "CreateObject",
        workspace,
        key,
        Map.of("objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
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

  private Map<String, Object> get(UUID workspace, String path) {
    return Map.of("items", http.getForEntity(base(workspace) + path, List.class).getBody());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Map<?, ?>> fields(Map<String, Object> response, String typeCode) {
    var types = (List<Map<String, Object>>) response.get("items");
    var type =
        types.stream()
            .filter(value -> typeCode.equals(value.get("code")))
            .findFirst()
            .orElseThrow();
    var fields = new LinkedHashMap<String, Map<?, ?>>();
    for (var field : (List<Map<?, ?>>) type.get("fields")) {
      fields.put((String) field.get("code"), field);
    }
    return fields;
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> rule(UUID workspace, Object request) {
    return post(workspace, "/rule-commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "sysml-profile-user");
    return http.postForEntity(
        base(workspace) + path, new HttpEntity<>(request, headers), Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private UUID objectType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private UUID objectType(UUID workspace, String code, UUID version) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ? AND template_version_id = ?",
        UUID.class,
        workspace,
        code,
        version);
  }

  private int count(String tableAndWhere) {
    return jdbc.queryForObject("SELECT count(*) FROM " + tableAndWhere, Integer.class);
  }

  private Object value(String sql, Object... args) {
    return jdbc.queryForObject(sql, Object.class, args);
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }

  private List<?> list(Map<?, ?> response, String key) {
    return (List<?>) response.get(key);
  }

  private String sampleXmi() throws Exception {
    return new ClassPathResource("sysml-profile-sample.xmi")
        .getContentAsString(StandardCharsets.UTF_8);
  }

  private String projectSetMainXmi() {
    return """
        <xmi:XMI xmlns:xmi="%s"
                 xmlns:uml="%s"
                 xmlns:sysml="%s">
          <uml:Model xmi:id="main-model">
            <packagedElement xmi:type="uml:Class" xmi:id="B1" name="Vehicle"/>
            <packagedElement xmi:type="uml:Association" xmi:id="A-lib" memberEnd="A-lib-source A-lib-target">
              <ownedEnd xmi:type="uml:Property" xmi:id="A-lib-source" type="B1"/>
              <ownedEnd xmi:type="uml:Property" xmi:id="A-lib-target" type="lib.xmi#L1"/>
            </packagedElement>
            <packagedElement xmi:type="uml:Dependency" xmi:id="D-external" client="B1" supplier="outside.xmi#EXT" appliedStereotype="trace"/>
          </uml:Model>
          <sysml:Block base_Class="B1"/>
        </xmi:XMI>
        """
        .formatted(XMI_NS, UML_NS, SYSML_NS);
  }

  private String projectSetLibraryXmi() {
    return """
        <xmi:XMI xmlns:xmi="%s"
                 xmlns:uml="%s"
                 xmlns:sysml="%s"
                 xmlns:mnext="urn:m-next:exchange:sysml"
                 xmlns:custom="urn:custom-profile">
          <uml:Model xmi:id="lib-model">
            <packagedElement xmi:type="uml:Class" xmi:id="L1" name="Library requirement">
              <ownedAttribute xmi:type="uml:Property" xmi:id="L1-req-id" name="req_id" type="String" mnext:value="REQ-LIB"/>
              <ownedAttribute xmi:type="uml:Property" xmi:id="L1-text" name="text" type="String" mnext:value="Library requirement"/>
            </packagedElement>
            <packagedElement xmi:type="uml:Class" xmi:id="C1" name="Opaque element"/>
          </uml:Model>
          <sysml:Requirement base_Class="L1"/>
          <custom:SpecialThing base_Class="C1"/>
        </xmi:XMI>
        """
        .formatted(XMI_NS, UML_NS, SYSML_NS);
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

  private String base(UUID workspace) {
    return "http://localhost:" + port + "/workspaces/" + workspace;
  }
}
