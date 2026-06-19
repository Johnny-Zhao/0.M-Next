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
class EnergyProfileE2EIntegrationTest {
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
  void energyProfileComputesSelectionRecalculationAndMarginRules() throws Exception {
    var template = template("energy_profile");
    var version = templateVersion(template);
    defineProfile(version);
    assertOk(meta(AUTHOR, publishTemplate(version, "publish-energy-profile")));
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-energy-profile")));
    assertDerivedFieldsCopied(workspace);

    var ids = ids(workspace);
    var sunlightMode = createObject(workspace, ids.mode(), "mode-sun", Map.of("name", "sun"));
    var eclipseMode =
        createObject(workspace, ids.mode(), "mode-eclipse", Map.of("name", "eclipse"));
    var avionics =
        createObject(
            workspace, ids.load(), "load-avionics", Map.of("name", "avionics", "power_w", 120));
    var thermal =
        createObject(
            workspace, ids.load(), "load-thermal", Map.of("name", "thermal", "power_w", 80));
    var heater =
        createObject(workspace, ids.load(), "load-heater", Map.of("name", "heater", "power_w", 40));
    var solar =
        createObject(
            workspace,
            ids.solar(),
            "solar-array",
            Map.of(
                "name",
                "solar",
                "required_power_input_w",
                200,
                "solar_constant_w_m2",
                100,
                "cell_efficiency",
                0.5,
                "fill_factor",
                0.5,
                "degradation_ratio",
                0.2,
                "temperature_factor",
                1));
    var battery =
        createObject(
            workspace,
            ids.battery(),
            "battery-pack",
            Map.of("name", "battery", "eclipse_min", 30, "dod_limit", 0.5));
    var bus = createObject(workspace, ids.bus(), "bus-pcdu", Map.of("name", "bus"));
    var solarCell =
        createObject(
            workspace,
            ids.solarCell(),
            "solar-cell",
            Map.of(
                "name",
                "solar cell",
                "mass_kg",
                5,
                "cost_cny",
                3500,
                "reliability",
                0.98,
                "power_w",
                240));
    var batteryA =
        createObject(
            workspace,
            ids.batteryCell(),
            "battery-cell-a",
            Map.of(
                "name",
                "battery A",
                "mass_kg",
                8,
                "cost_cny",
                5000,
                "reliability",
                0.96,
                "capacity_wh",
                150));
    var batteryB =
        createObject(
            workspace,
            ids.batteryCell(),
            "battery-cell-b",
            Map.of(
                "name",
                "battery B",
                "mass_kg",
                6,
                "cost_cny",
                4200,
                "reliability",
                0.94,
                "capacity_wh",
                100));
    var pcdu =
        createObject(
            workspace,
            ids.product(),
            "pcdu-product",
            Map.of("name", "pcdu product", "mass_kg", 3, "cost_cny", 2500, "reliability", 0.99));

    relate(workspace, ids.modeHasLoad(), sunlightMode, avionics, "sun-avionics");
    relate(workspace, ids.modeHasLoad(), sunlightMode, thermal, "sun-thermal");
    relate(workspace, ids.modeHasLoad(), eclipseMode, avionics, "eclipse-avionics");
    relate(workspace, ids.powersBus(), solar, sunlightMode, "solar-powers-sun");
    relate(workspace, ids.feeds(), battery, eclipseMode, "battery-feeds-eclipse");
    relate(workspace, ids.selectedAs(), solar, solarCell, "select-solar");
    relate(workspace, ids.selectedAs(), battery, batteryA, "select-battery-a");
    relate(workspace, ids.selectedAs(), bus, solarCell, "bus-select-solar");
    relate(workspace, ids.selectedAs(), bus, batteryA, "bus-select-battery-a");
    relate(workspace, ids.selectedAs(), bus, pcdu, "bus-select-pcdu");
    relate(workspace, ids.redundantWith(), battery, bus, "battery-redundant");
    projectOutbox();

    assertDecimal("200", derivedEvaluator.evaluate(workspace, sunlightMode, "sunlight_power_w"));
    assertDecimal("120", derivedEvaluator.evaluate(workspace, eclipseMode, "eclipse_power_w"));
    assertDecimal("200", derivedEvaluator.evaluate(workspace, solar, "required_power_eol_w"));
    assertDecimal("10", derivedEvaluator.evaluate(workspace, solar, "area_m2"));
    assertDecimal("0.2", derivedEvaluator.evaluate(workspace, solar, "power_margin"));
    assertDecimal("60", derivedEvaluator.evaluate(workspace, battery, "required_energy_wh"));
    assertDecimal("120", derivedEvaluator.evaluate(workspace, battery, "capacity_wh"));
    assertDecimal("150", derivedEvaluator.evaluate(workspace, battery, "installed_capacity_wh"));
    assertDecimal("0.25", derivedEvaluator.evaluate(workspace, battery, "energy_margin"));
    assertDecimal("0.4", derivedEvaluator.evaluate(workspace, battery, "dod_actual"));
    assertDecimal("16", derivedEvaluator.evaluate(workspace, bus, "mass_total"));
    assertDecimal("11000", derivedEvaluator.evaluate(workspace, bus, "cost_total"));

    var solarOk = runId(rule(workspace, runRuleCheck(workspace, "solar_array", "solar-ok")));
    var batteryOk = runId(rule(workspace, runRuleCheck(workspace, "battery_pack", "battery-ok")));
    assertEquals(0, countResults(workspace, solarOk, "power_margin_low"));
    assertEquals(0, countResults(workspace, batteryOk, "energy_margin_breach"));
    assertEquals(0, countResults(workspace, batteryOk, "energy_margin_negative"));
    assertEquals(0, countResults(workspace, batteryOk, "dod_limit_exceeded"));

    assertOk(
        command(
            workspace,
            unlink(
                workspace,
                relationId(workspace, ids.selectedAs(), battery, batteryA),
                "unlink-battery-a")));
    assertOk(
        command(
            workspace,
            createRelation(workspace, ids.selectedAs(), battery, batteryB, "select-battery-b")));
    assertOk(
        command(
            workspace,
            unlink(
                workspace,
                relationId(workspace, ids.selectedAs(), bus, batteryA),
                "unlink-bus-battery-a")));
    assertOk(
        command(
            workspace,
            createRelation(workspace, ids.selectedAs(), bus, batteryB, "bus-select-battery-b")));
    projectOutbox();

    assertDecimal("100", derivedEvaluator.evaluate(workspace, battery, "installed_capacity_wh"));
    assertDecimal("0.6", derivedEvaluator.evaluate(workspace, battery, "dod_actual"));
    assertDecimal("14", derivedEvaluator.evaluate(workspace, bus, "mass_total"));
    assertDecimal("10200", derivedEvaluator.evaluate(workspace, bus, "cost_total"));
    var weakBattery =
        runId(rule(workspace, runRuleCheck(workspace, "battery_pack", "battery-weak")));
    assertEquals(1, countResults(workspace, weakBattery, "energy_margin_breach"));
    assertEquals(1, countResults(workspace, weakBattery, "energy_margin_negative"));
    assertEquals(1, countResults(workspace, weakBattery, "dod_limit_exceeded"));
  }

  private void defineProfile(UUID version) {
    defineValueTypes(version);
    defineObject(version, "mission_orbit", "Mission Orbit", null, "object-mission-orbit");
    defineObject(version, "operating_mode", "Operating Mode", null, "object-operating-mode");
    defineObject(version, "load_item", "Load Item", null, "object-load-item");
    defineObject(version, "equipment_slot", "Equipment Slot", null, "object-equipment-slot");
    defineObject(version, "solar_array", "Solar Array", "equipment_slot", "object-solar-array");
    defineObject(version, "battery_pack", "Battery Pack", "equipment_slot", "object-battery-pack");
    defineObject(version, "bus_pcdu", "Bus PCDU", "equipment_slot", "object-bus-pcdu");
    defineObject(version, "product_item", "Product Item", null, "object-product-item");
    defineObject(version, "solar_cell", "Solar Cell", "product_item", "object-solar-cell");
    defineObject(version, "battery_cell", "Battery Cell", "product_item", "object-battery-cell");
    defineFields();
    defineRelations(version);
    defineDerived(version);
    defineRules(version);
  }

  private void defineValueTypes(UUID version) {
    defineValueType(version, "power_w", "Power W");
    defineValueType(version, "energy_wh", "Energy Wh");
    defineValueType(version, "mass_kg", "Mass kg");
    defineValueType(version, "area_m2", "Area m2");
    defineValueType(version, "ratio", "Ratio");
    defineValueType(version, "cost_cny", "Cost CNY");
  }

  private void defineFields() {
    var mode = objectType(AUTHOR, "operating_mode");
    var load = objectType(AUTHOR, "load_item");
    var slot = objectType(AUTHOR, "equipment_slot");
    var solar = objectType(AUTHOR, "solar_array");
    var battery = objectType(AUTHOR, "battery_pack");
    var product = objectType(AUTHOR, "product_item");
    var solarCell = objectType(AUTHOR, "solar_cell");
    var batteryCell = objectType(AUTHOR, "battery_cell");
    defineField(mode, "name", "Name", "string", null, true, "field-mode-name");
    defineField(load, "name", "Name", "string", null, true, "field-load-name");
    defineField(load, "power_w", "Power", null, "power_w", true, "field-load-power");
    defineField(slot, "name", "Name", "string", null, true, "field-slot-name");
    defineField(
        solar,
        "required_power_input_w",
        "Required Power Input",
        null,
        "power_w",
        true,
        "field-solar-required-input");
    defineField(
        solar,
        "solar_constant_w_m2",
        "Solar Constant",
        null,
        "power_w",
        true,
        "field-solar-constant");
    defineField(
        solar, "cell_efficiency", "Cell Efficiency", null, "ratio", true, "field-cell-efficiency");
    defineField(solar, "fill_factor", "Fill Factor", null, "ratio", true, "field-fill-factor");
    defineField(
        solar, "degradation_ratio", "Degradation Ratio", null, "ratio", true, "field-degradation");
    defineField(
        solar,
        "temperature_factor",
        "Temperature Factor",
        null,
        "ratio",
        true,
        "field-temperature");
    defineField(
        battery, "eclipse_min", "Eclipse Minutes", "number", null, true, "field-eclipse-min");
    defineField(battery, "dod_limit", "DOD Limit", null, "ratio", true, "field-dod-limit");
    defineField(product, "name", "Name", "string", null, true, "field-product-name");
    defineField(product, "mass_kg", "Mass", null, "mass_kg", true, "field-product-mass");
    defineField(product, "cost_cny", "Cost", null, "cost_cny", true, "field-product-cost");
    defineField(
        product, "reliability", "Reliability", null, "ratio", true, "field-product-reliability");
    defineField(solarCell, "power_w", "Power", null, "power_w", true, "field-solar-cell-power");
    defineField(
        batteryCell,
        "capacity_wh",
        "Capacity",
        null,
        "energy_wh",
        true,
        "field-battery-cell-capacity");
  }

  private void defineRelations(UUID version) {
    defineRelation(version, "mode_has_load", "Mode Has Load", "operating_mode", "load_item");
    defineRelation(version, "powers_bus", "Powers Bus", "solar_array", "operating_mode");
    defineRelation(version, "feeds", "Feeds", "battery_pack", "operating_mode");
    defineRelation(version, "selected_as", "Selected As", "equipment_slot", "product_item");
    defineRelation(version, "redundant_with", "Redundant With", "equipment_slot", "equipment_slot");
  }

  private void defineDerived(UUID version) {
    var mode = objectType(AUTHOR, "operating_mode");
    var solar = objectType(AUTHOR, "solar_array");
    var battery = objectType(AUTHOR, "battery_pack");
    var bus = objectType(AUTHOR, "bus_pcdu");
    defineDerived(
        version,
        mode,
        "sunlight_power_w",
        "Sunlight Power",
        "sum(traverse('mode_has_load','out'),'power_w')");
    defineDerived(
        version,
        mode,
        "eclipse_power_w",
        "Eclipse Power",
        "sum(traverse('mode_has_load','out'),'power_w')");
    defineDerived(
        version,
        solar,
        "required_power_eol_w",
        "Required EOL Power",
        "field('required_power_input_w')");
    defineDerived(
        version,
        solar,
        "installed_power_w",
        "Installed Power",
        "sum(traverse('selected_as','out'),'power_w')");
    defineDerived(
        version,
        solar,
        "area_m2",
        "Array Area",
        "field('required_power_eol_w') / (field('solar_constant_w_m2') * field('cell_efficiency') * field('fill_factor') * (1 - field('degradation_ratio')) * field('temperature_factor'))");
    defineDerived(
        version,
        solar,
        "power_margin",
        "Power Margin",
        "(field('installed_power_w') - field('required_power_eol_w')) / field('required_power_eol_w')");
    defineDerived(
        version,
        battery,
        "eclipse_power_w",
        "Eclipse Power",
        "sum(traverse('feeds','out'),'eclipse_power_w')");
    defineDerived(
        version,
        battery,
        "required_energy_wh",
        "Required Energy",
        "field('eclipse_power_w') * field('eclipse_min') / 60");
    defineDerived(
        version,
        battery,
        "capacity_wh",
        "Required Capacity",
        "field('required_energy_wh') / field('dod_limit')");
    defineDerived(
        version,
        battery,
        "installed_capacity_wh",
        "Installed Capacity",
        "sum(traverse('selected_as','out'),'capacity_wh')");
    defineDerived(
        version,
        battery,
        "energy_margin",
        "Energy Margin",
        "(field('installed_capacity_wh') - field('capacity_wh')) / field('capacity_wh')");
    defineDerived(
        version,
        battery,
        "dod_actual",
        "DOD Actual",
        "field('required_energy_wh') / field('installed_capacity_wh')");
    defineDerived(
        version, bus, "mass_total", "Mass Total", "sum(traverse('selected_as','out'),'mass_kg')");
    defineDerived(
        version, bus, "cost_total", "Cost Total", "sum(traverse('selected_as','out'),'cost_cny')");
    defineDerived(
        version,
        bus,
        "selected_reliability",
        "Selected Reliability",
        "sum(traverse('selected_as','out'),'reliability') / count(traverse('selected_as','out'))");
    defineDerived(
        version,
        bus,
        "redundancy_count",
        "Redundancy Count",
        "count(traverse('redundant_with','in'))");
  }

  private void defineRules(UUID version) {
    defineRule(version, "power_margin_low", "solar_array", "WARN", "field('power_margin') < 0.10");
    defineRule(
        version, "energy_margin_breach", "battery_pack", "WARN", "field('energy_margin') < 0.10");
    defineRule(
        version, "energy_margin_negative", "battery_pack", "BLOCK", "field('energy_margin') < 0");
    defineRule(
        version,
        "dod_limit_exceeded",
        "battery_pack",
        "BLOCK",
        "field('dod_actual') > field('dod_limit')");
  }

  private void defineObject(UUID version, String code, String name, String parent, String key) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateVersionId", version);
    payload.put("code", code);
    payload.put("name", name);
    if (parent != null) payload.put("parentTypeCode", parent);
    assertOk(meta(AUTHOR, command("DefineObjectType", AUTHOR, key, payload)));
  }

  private void defineValueType(UUID version, String code, String name) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineValueType",
                AUTHOR,
                "value-" + code,
                Map.of(
                    "templateVersionId", version,
                    "code", code,
                    "name", name,
                    "basePrimitive", "number"))));
  }

  private void defineField(
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
    assertOk(meta(AUTHOR, command("DefineFieldDef", AUTHOR, key, payload)));
  }

  private void defineRelation(
      UUID version, String code, String name, String source, String target) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineRelationType",
                AUTHOR,
                "relation-" + code,
                Map.of(
                    "code",
                    code,
                    "name",
                    name,
                    "sourceTypeId",
                    objectType(AUTHOR, source),
                    "targetTypeId",
                    objectType(AUTHOR, target),
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

  private void defineDerived(
      UUID version, UUID objectType, String code, String name, String derivation) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineDerivedField",
                AUTHOR,
                "derived-" + objectType.toString().substring(0, 8) + "-" + code,
                Map.of(
                    "templateVersionId", version,
                    "objectTypeId", objectType,
                    "code", code,
                    "name", name,
                    "resultType", "number",
                    "derivation", derivation))));
  }

  private void defineRule(
      UUID version, String code, String objectType, String severity, String when) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateVersionId", version);
    payload.put("ruleCode", code);
    payload.put("scope", Map.of("objectTypeCode", objectType));
    payload.put("severity", severity);
    payload.put("when", when);
    payload.put(
        "message",
        code + " ${field('power_margin')}${field('energy_margin')}${field('dod_actual')}");
    payload.put("lightweight", false);
    assertOk(rule(AUTHOR, command("DefineRule", AUTHOR, "rule-" + code, payload)));
    assertOk(
        rule(AUTHOR, command("PublishRule", AUTHOR, "publish-" + code, Map.of("ruleCode", code))));
  }

  private UUID createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    var response = command(workspace, createObjectCommand(workspace, objectType, key, fields));
    assertOk(response);
    return createdObjectId(response.getBody());
  }

  private void relate(UUID workspace, UUID type, UUID source, UUID target, String key) {
    assertOk(command(workspace, createRelation(workspace, type, source, target, key)));
  }

  private Map<String, Object> createObjectCommand(
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
            "relationTypeId", relationType,
            "sourceId", source,
            "targetId", target,
            "relationFields", Map.of(),
            "source", Map.of("type", "manual")));
  }

  private Map<String, Object> unlink(UUID workspace, UUID relationId, String key) {
    return command(
        "Unlink",
        workspace,
        key,
        Map.of("relationId", relationId, "reason", "selection changed", "expectedVersion", 1));
  }

  private Map<String, Object> runRuleCheck(UUID workspace, String objectTypeCode, String key) {
    return command(
        "RunRuleCheck", workspace, key, Map.of("scope", Map.of("objectTypeCode", objectTypeCode)));
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
            "Energy Project"));
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
    headers.set("X-Actor-Id", "energy-profile-user");
    return http.postForEntity(
        base(workspace) + path, new HttpEntity<>(request, headers), Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private String runId(ResponseEntity<Map> response) {
    assertOk(response);
    return (String) ((List<?>) response.getBody().get("events")).getFirst();
  }

  private UUID createdObjectId(Map body) {
    for (var eventId : (List<?>) body.get("events")) {
      var objectId =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (objectId != null) return UUID.fromString(objectId);
    }
    throw new IllegalStateException("CreateObject did not emit ObjectCreated");
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

  private Ids ids(UUID workspace) {
    return new Ids(
        objectType(workspace, "operating_mode"),
        objectType(workspace, "load_item"),
        objectType(workspace, "solar_array"),
        objectType(workspace, "battery_pack"),
        objectType(workspace, "bus_pcdu"),
        objectType(workspace, "product_item"),
        objectType(workspace, "solar_cell"),
        objectType(workspace, "battery_cell"),
        relationType(workspace, "mode_has_load"),
        relationType(workspace, "powers_bus"),
        relationType(workspace, "feeds"),
        relationType(workspace, "selected_as"),
        relationType(workspace, "redundant_with"));
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

  private UUID relationId(UUID workspace, UUID relationType, UUID source, UUID target) {
    return jdbc.queryForObject(
        """
        SELECT id
        FROM data_relation
        WHERE workspace_id = ? AND relation_type_id = ? AND source_id = ? AND target_id = ?
          AND status = 'ACTIVE'
        """,
        UUID.class,
        workspace,
        relationType,
        source,
        target);
  }

  private int countResults(UUID workspace, String runId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM check_result
        WHERE workspace_id = ? AND run_id = ?::uuid AND rule_code = ?
        """,
        Integer.class,
        workspace,
        runId,
        ruleCode);
  }

  private UUID resultObject(UUID workspace, String runId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT object_id
        FROM check_result
        WHERE workspace_id = ? AND run_id = ?::uuid AND rule_code = ?
        """,
        UUID.class,
        workspace,
        runId,
        ruleCode);
  }

  private void assertDerivedFieldsCopied(UUID workspace) {
    assertEquals(
        16,
        jdbc.queryForObject(
            "SELECT count(*) FROM derived_field WHERE workspace_id = ? AND template_version_id IS NULL",
            Integer.class,
            workspace));
    assertEquals(2, descendantTypeCount(workspace, "product_item"));
  }

  private int descendantTypeCount(UUID workspace, String parentCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM object_type child
        JOIN object_type parent ON parent.id = child.parent_type_id
        WHERE child.workspace_id = ? AND parent.workspace_id = ? AND parent.code = ?
        """,
        Integer.class,
        workspace,
        workspace,
        parentCode);
  }

  private void assertDecimal(String expected, Object actual) {
    assertTrue(actual instanceof Number, "expected Number but got " + actual);
    assertEquals(
        0,
        new BigDecimal(expected).compareTo(new BigDecimal(actual.toString())),
        "expected " + expected + " but got " + actual);
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

  private record Ids(
      UUID mode,
      UUID load,
      UUID solar,
      UUID battery,
      UUID bus,
      UUID product,
      UUID solarCell,
      UUID batteryCell,
      UUID modeHasLoad,
      UUID powersBus,
      UUID feeds,
      UUID selectedAs,
      UUID redundantWith) {}
}
