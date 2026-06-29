package com.mnext.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.events.EventEnvelope;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import com.mnext.server.plugin.ProfileManifest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Profile("dev")
class DevSeedRunner implements ApplicationRunner {
  private static final Logger LOG = LoggerFactory.getLogger(DevSeedRunner.class);
  private static final UUID DEMO_WORKSPACE =
      UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID TECHNICAL_WORKSPACE =
      UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final UUID MBSE_WORKSPACE =
      UUID.fromString("33333333-3333-4333-8333-333333333333");
  private static final String AUTHOR = ProfileLoader.AUTHOR_WORKSPACE.toString();
  private static final String INTERIOR_TEMPLATE_CODE = "interior_design";
  private static final String TECHNICAL_TEMPLATE_CODE = "technical_proposal";
  private static final String MBSE_TEMPLATE_CODE = "mbse_verification";

  private final ProfileLoader profileLoader;
  private final TemplateLifecycleService lifecycle;
  private final KernelCommandService commands;
  private final RuleCheckRunner ruleChecks;
  private final ReadModelProjection projection;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  DevSeedRunner(
      ProfileLoader profileLoader,
      TemplateLifecycleService lifecycle,
      KernelCommandService commands,
      RuleCheckRunner ruleChecks,
      ReadModelProjection projection,
      JdbcTemplate jdbc,
      ObjectMapper mapper) {
    this.profileLoader = profileLoader;
    this.lifecycle = lifecycle;
    this.commands = commands;
    this.ruleChecks = ruleChecks;
    this.projection = projection;
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Override
  public void run(ApplicationArguments args) throws Exception {
    var manifest = interiorManifest();
    var actor = Actor.user(AUTHOR);
    profileLoader.install(manifest, actor);
    ensureDemoWorkspace(manifest, actor, DEMO_WORKSPACE, "室内设计 Demo");
    if (!demoFloorplanExists()) {
      seedDemoObjects();
    }
    var technicalManifest = technicalManifest();
    profileLoader.install(technicalManifest, actor);
    ensureDemoWorkspace(technicalManifest, actor, TECHNICAL_WORKSPACE, "技术方案 Demo");
    if (!technicalProposalExists()) {
      seedTechnicalProposalObjects();
    }
    var mbseManifest = mbseManifest();
    profileLoader.install(mbseManifest, actor);
    ensureDemoWorkspace(mbseManifest, actor, MBSE_WORKSPACE, "MBSE Demo");
    if (!mbseMissionExists()) {
      seedMbseObjects();
    }
  }

  @EventListener(ApplicationReadyEvent.class)
  void runChecksAfterReadModelReady() throws InterruptedException {
    waitForReadModelRooms();
    waitForReadModelTechnicalModules();
    waitForReadModelMbseRequirements();
    runRoomRuleChecks();
    runTechnicalRuleChecks();
    runMbseRuleChecks();
    LOG.info("DEV SEED: interior-design installed, demo workspace {} ready", DEMO_WORKSPACE);
    LOG.info(
        "DEV SEED: technical-proposal installed, demo workspace {} ready", TECHNICAL_WORKSPACE);
    LOG.info("DEV SEED: mbse installed, demo workspace {} ready", MBSE_WORKSPACE);
  }

  private ProfileManifest interiorManifest() throws Exception {
    return manifest("interior-design", "interior");
  }

  private ProfileManifest technicalManifest() throws Exception {
    return manifest("technical-proposal", "technical proposal");
  }

  private ProfileManifest mbseManifest() throws Exception {
    return manifest("mbse", "mbse");
  }

  private ProfileManifest manifest(String domain, String label) throws Exception {
    for (var path : manifestCandidates(domain)) {
      if (Files.exists(path)) {
        try (var input = Files.newInputStream(path)) {
          return mapper.readValue(input, ProfileManifest.class);
        }
      }
    }
    throw new IllegalStateException(
        "DEV SEED: " + label + " profile.manifest.json is not readable");
  }

  private Path[] manifestCandidates(String domain) {
    return new Path[] {
      Path.of("packages", "domains", domain, "profile.manifest.json"),
      Path.of("..", "domains", domain, "profile.manifest.json"),
      Path.of("..", "..", "packages", "domains", domain, "profile.manifest.json").normalize()
    };
  }

  private void ensureDemoWorkspace(
      ProfileManifest manifest, Actor actor, UUID workspaceId, String workspaceName) {
    if (workspaceExists(workspaceId)) {
      if (workspaceHasRuntimeProfileTypes(workspaceId, manifest)) {
        return;
      }
      if (replaceableLegacyInteriorWorkspace(workspaceId)) {
        removeLegacyInteriorWorkspace();
      } else {
        throw new IllegalStateException(
            "DEV SEED: workspace "
                + workspaceId
                + " exists but is not an instantiated "
                + manifest.templateCode()
                + " workspace");
      }
    }
    lifecycle.instantiateWorkspace(
        new InstantiateWorkspaceCommand(
            ProfileLoader.AUTHOR_WORKSPACE,
            UUID.randomUUID(),
            key(manifest.templateCode(), "instantiate"),
            templateId(manifest.templateCode()),
            1,
            workspaceId,
            workspaceName),
        actor);
  }

  private boolean workspaceExists(UUID workspaceId) {
    var count =
        jdbc.queryForObject(
            "SELECT count(*) FROM workspace WHERE id = ?", Integer.class, workspaceId);
    return count != null && count > 0;
  }

  private boolean workspaceHasRuntimeProfileTypes(UUID workspaceId, ProfileManifest manifest) {
    if (manifest.objectTypesOrEmpty().isEmpty()) {
      return true;
    }
    var firstTypeCode = manifest.objectTypesOrEmpty().getFirst().code();
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM object_type
            WHERE workspace_id = ? AND template_version_id IS NULL AND code = ?
            """,
            Integer.class,
            workspaceId,
            firstTypeCode);
    return count != null && count > 0;
  }

  private boolean replaceableLegacyInteriorWorkspace(UUID workspaceId) {
    if (!DEMO_WORKSPACE.equals(workspaceId)) {
      return false;
    }
    return countRows("data_object", workspaceId) == 0
        && countRows("workspace_member", workspaceId) == 0
        && unexpectedObjectTypes(workspaceId) == 0
        && unexpectedRelationTypes(workspaceId) == 0;
  }

  private void removeLegacyInteriorWorkspace() {
    jdbc.update("DELETE FROM relation_type WHERE workspace_id = ?", DEMO_WORKSPACE);
    jdbc.update(
        """
        DELETE FROM field_def
        WHERE object_type_id IN (SELECT id FROM object_type WHERE workspace_id = ?)
        """,
        DEMO_WORKSPACE);
    jdbc.update("DELETE FROM object_type WHERE workspace_id = ?", DEMO_WORKSPACE);
    jdbc.update("DELETE FROM value_type WHERE workspace_id = ?", DEMO_WORKSPACE);
    jdbc.update("DELETE FROM workspace WHERE id = ?", DEMO_WORKSPACE);
  }

  private int countRows(String table, UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM " + table + " WHERE workspace_id = ?", Integer.class, workspaceId);
  }

  private int unexpectedObjectTypes(UUID workspaceId) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM object_type
        WHERE workspace_id = ? AND code <> 'demo_object'
        """,
        Integer.class,
        workspaceId);
  }

  private int unexpectedRelationTypes(UUID workspaceId) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM relation_type
        WHERE workspace_id = ? AND code NOT IN ('depends_on', 'decomposes_to')
        """,
        Integer.class,
        workspaceId);
  }

  private boolean demoFloorplanExists() {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM data_object object
            JOIN object_type type ON type.id = object.object_type_id
            WHERE object.workspace_id = ? AND type.code = 'floorplan'
            """,
            Integer.class,
            DEMO_WORKSPACE);
    return count != null && count > 0;
  }

  private boolean technicalProposalExists() {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM data_object object
            JOIN object_type type ON type.id = object.object_type_id
            WHERE object.workspace_id = ? AND type.code = 'proposal'
            """,
            Integer.class,
            TECHNICAL_WORKSPACE);
    return count != null && count > 0;
  }

  private boolean mbseMissionExists() {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM data_object object
            JOIN object_type type ON type.id = object.object_type_id
            WHERE object.workspace_id = ? AND type.code = 'mission'
            """,
            Integer.class,
            MBSE_WORKSPACE);
    return count != null && count > 0;
  }

  private void seedDemoObjects() {
    var floorplanType = objectType("floorplan");
    var roomType = objectType("room");
    var containsType = relationType("contains");
    var adjacentType = relationType("adjacent");

    var floorplan = createObject(floorplanType, "floorplan", Map.of("name", "样板户型 A1", "floor", 3));
    var living =
        createObject(
            roomType,
            "room-living",
            roomFields("客厅", "客厅", 5.6, 4.2, 0.0, 0.0, "S", 5.0, 3.2, 420, 24, 1.2, 0.8, 1.4));
    var master =
        createObject(
            roomType,
            "room-master",
            roomFields("主卧", "卧室", 4.2, 3.6, 0.0, 4.2, "E", 2.0, 2.6, 260, 24, 1.3, 0.6, 0.7));
    var second =
        createObject(
            roomType,
            "room-second",
            roomFields("暗次卧", "卧室", 3.4, 3.0, 4.2, 4.2, "N", 0.8, 1.4, 120, 22, 1.6, 0.5, 1.1));
    var kitchen =
        createObject(
            roomType,
            "room-kitchen",
            roomFields("厨房", "厨房", 3.2, 2.4, 5.6, 0.0, "E", 1.4, 2.8, 320, 25, 1.8, 0.9, 1.2));
    var bath =
        createObject(
            roomType,
            "room-bath",
            roomFields("卫生间", "卫生间", 2.4, 2.0, 5.6, 2.4, "N", 0.7, 2.4, 180, 23, 1.7, 0.4, 1.0));
    var study =
        createObject(
            roomType,
            "room-study",
            roomFields("西晒书房", "书房", 3.6, 2.8, 7.6, 4.2, "W", 1.8, 2.5, 300, 28, 1.5, 0.7, 1.3));

    relate(containsType, floorplan, living, "contains-living");
    relate(containsType, floorplan, master, "contains-master");
    relate(containsType, floorplan, second, "contains-second");
    relate(containsType, floorplan, kitchen, "contains-kitchen");
    relate(containsType, floorplan, bath, "contains-bath");
    relate(containsType, floorplan, study, "contains-study");
    relate(adjacentType, living, kitchen, "adjacent-living-kitchen");
    relate(adjacentType, living, master, "adjacent-living-master");
    relate(adjacentType, master, second, "adjacent-master-second");
    relate(adjacentType, living, study, "adjacent-living-study");
  }

  private Map<String, Object> roomFields(
      String name,
      String usage,
      Number length,
      Number width,
      Number planX,
      Number planY,
      String orientation,
      Number windowArea,
      Number daylightFactor,
      Number illuminance,
      Number temperature,
      Number thermalU,
      Number thermalLoad,
      Number windAch) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("name", name);
    fields.put("usage", usage);
    fields.put("length_m", length);
    fields.put("width_m", width);
    fields.put("plan_x", planX);
    fields.put("plan_y", planY);
    fields.put("orientation", orientation);
    fields.put("window_area_m2", windowArea);
    fields.put("light_df", daylightFactor);
    fields.put("light_illuminance", illuminance);
    fields.put("thermal_temp", temperature);
    fields.put("thermal_u", thermalU);
    fields.put("thermal_load", thermalLoad);
    fields.put("wind_ach", windAch);
    return fields;
  }

  private void seedTechnicalProposalObjects() {
    var proposalType = objectType(TECHNICAL_WORKSPACE, "proposal");
    var systemType = objectType(TECHNICAL_WORKSPACE, "system");
    var moduleType = objectType(TECHNICAL_WORKSPACE, "module");
    var interfaceType = objectType(TECHNICAL_WORKSPACE, "interface");
    var requirementType = objectType(TECHNICAL_WORKSPACE, "requirement");
    var containsSystemType = relationType(TECHNICAL_WORKSPACE, "proposal_contains_system");
    var containsModuleType = relationType(TECHNICAL_WORKSPACE, "proposal_contains_module");
    var dependsOnType = relationType(TECHNICAL_WORKSPACE, "proposal_depends_on");
    var interfacesWithType = relationType(TECHNICAL_WORKSPACE, "proposal_interfaces_with");
    var satisfiesType = relationType(TECHNICAL_WORKSPACE, "proposal_satisfies");

    var proposal =
        createTechnicalObject(
            proposalType,
            "proposal",
            Map.of("title", "技术方案 Demo", "version", "v1.0", "author", "dev-seed"));
    var platformSystem =
        createTechnicalObject(
            systemType,
            "system-platform",
            Map.of("name", "方案协作系统", "responsibility", "承载技术方案编排与评审"));
    var integrationSystem =
        createTechnicalObject(
            systemType,
            "system-integration",
            Map.of("name", "集成接入系统", "responsibility", "连接文档、模型与导出服务"));
    var orchestration =
        createTechnicalObject(
            moduleType,
            "module-orchestration",
            technicalModuleFields("方案编排模块", "组织系统、模块、接口与需求", "技术方案核心模块"));
    var generation =
        createTechnicalObject(
            moduleType,
            "module-generation",
            technicalModuleFields("章节生成模块", "生成方案章节与摘要", "由编排模块下钻"));
    var adapter =
        createTechnicalObject(
            moduleType, "module-adapter", technicalModuleFields("适配接入模块", "同步模型与文档制品", "集成接入"));
    var undecided =
        createTechnicalObject(
            moduleType, "module-undecided", Map.of("name", "待明确模块", "description", "触发职责规则"));
    var exportInterface =
        createTechnicalObject(
            interfaceType,
            "interface-export",
            technicalInterfaceFields("方案导出接口", "out", "HTTP", "snapshotId, format"));
    var reviewInterface =
        createTechnicalObject(
            interfaceType,
            "interface-review",
            Map.of("name", "评审回写接口", "direction", "in", "protocol", ""));
    var coveredRequirement =
        createTechnicalObject(
            requirementType,
            "requirement-covered",
            technicalRequirementFields("REQ-TP-001", "系统必须生成技术方案章节", "HIGH"));
    var openRequirement =
        createTechnicalObject(
            requirementType,
            "requirement-open",
            technicalRequirementFields("REQ-TP-002", "接口必须声明协议和数据", "MEDIUM"));

    relateTechnical(containsSystemType, proposal, platformSystem, "contains-platform-system");
    relateTechnical(containsSystemType, proposal, integrationSystem, "contains-integration-system");
    relateTechnical(containsModuleType, platformSystem, orchestration, "contains-orchestration");
    relateTechnical(containsModuleType, orchestration, generation, "contains-generation");
    relateTechnical(containsModuleType, integrationSystem, adapter, "contains-adapter");
    relateTechnical(containsModuleType, integrationSystem, undecided, "contains-undecided");
    relateTechnical(dependsOnType, generation, orchestration, "generation-depends-orchestration");
    relateTechnical(interfacesWithType, orchestration, exportInterface, "orchestration-export");
    relateTechnical(interfacesWithType, adapter, reviewInterface, "adapter-review");
    relateTechnical(satisfiesType, orchestration, coveredRequirement, "orchestration-satisfies");
  }

  private Map<String, Object> technicalModuleFields(
      String name, String responsibility, String description) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("name", name);
    fields.put("responsibility", responsibility);
    fields.put("description", description);
    return fields;
  }

  private Map<String, Object> technicalInterfaceFields(
      String name, String direction, String protocol, String data) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("name", name);
    fields.put("direction", direction);
    fields.put("protocol", protocol);
    fields.put("data", data);
    return fields;
  }

  private Map<String, Object> technicalRequirementFields(
      String code, String text, String priority) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("code", code);
    fields.put("text", text);
    fields.put("priority", priority);
    return fields;
  }

  private void seedMbseObjects() {
    var missionType = objectType(MBSE_WORKSPACE, "mission");
    var contextType = objectType(MBSE_WORKSPACE, "mission_context");
    var phaseType = objectType(MBSE_WORKSPACE, "phase");
    var conditionType = objectType(MBSE_WORKSPACE, "env_condition");
    var capabilityType = objectType(MBSE_WORKSPACE, "capability");
    var requirementType = objectType(MBSE_WORKSPACE, "requirement");
    var testCaseType = objectType(MBSE_WORKSPACE, "test_case");
    var testResultType = objectType(MBSE_WORKSPACE, "test_result");
    var occursInType = relationType(MBSE_WORKSPACE, "occurs_in");
    var imposesType = relationType(MBSE_WORKSPACE, "imposes");
    var requiresType = relationType(MBSE_WORKSPACE, "requires");
    var derivesType = relationType(MBSE_WORKSPACE, "derives");
    var verifiedByType = relationType(MBSE_WORKSPACE, "verified_by");
    var producesType = relationType(MBSE_WORKSPACE, "produces");

    var mission = createMbseObject(missionType, "mission", Map.of("name", "低空巡检任务"));
    var context = createMbseObject(contextType, "context", Map.of("name", "城市低空巡检场景"));
    var launchPhase = createMbseObject(phaseType, "phase-launch", Map.of("name", "起飞准备"));
    var patrolPhase = createMbseObject(phaseType, "phase-patrol", Map.of("name", "巡检执行"));
    var wind =
        createMbseObject(
            conditionType, "condition-wind", Map.of("name", "侧风工况", "value", "侧风 <= 10m/s"));
    var rain =
        createMbseObject(
            conditionType, "condition-rain", Map.of("name", "降雨工况", "value", "小雨可运行"));
    var navigation =
        createMbseObject(capabilityType, "capability-navigation", Map.of("name", "自主导航"));
    var resilience =
        createMbseObject(capabilityType, "capability-resilience", Map.of("name", "环境适应"));

    relateMbse(occursInType, launchPhase, mission, "launch-occurs-in");
    relateMbse(occursInType, patrolPhase, mission, "patrol-occurs-in");
    relateMbse(imposesType, launchPhase, wind, "launch-imposes-wind");
    relateMbse(imposesType, patrolPhase, rain, "patrol-imposes-rain");
    relateMbse(requiresType, context, navigation, "context-requires-navigation");
    relateMbse(requiresType, context, resilience, "context-requires-resilience");

    var routeRequirement =
        createMbseObject(
            requirementType,
            "requirement-route",
            requirementFields("REQ-MBSE-001", "系统应按规划航线自主巡检", "航线偏差 <= 2m", 0.2));
    var windRequirement =
        createMbseObject(
            requirementType,
            "requirement-wind",
            requirementFields("REQ-MBSE-002", "系统应在侧风下保持姿态稳定", "姿态误差 <= 5deg", 0.15));
    var rainRequirement =
        createMbseObject(
            requirementType,
            "requirement-rain",
            requirementFields("REQ-MBSE-003", "系统应在小雨环境完成巡检", "任务完成率 >= 95%", 0.1));
    var recoveryRequirement =
        createMbseObject(
            requirementType,
            "requirement-recovery",
            requirementFields("REQ-MBSE-004", "链路中断后系统应安全返航", "返航触发 <= 3s", 0.25));

    relateMbse(derivesType, navigation, routeRequirement, "navigation-derives-route");
    relateMbse(derivesType, navigation, windRequirement, "navigation-derives-wind");
    relateMbse(derivesType, resilience, rainRequirement, "resilience-derives-rain");
    relateMbse(derivesType, resilience, recoveryRequirement, "resilience-derives-recovery");

    var routeTest = createMbseObject(testCaseType, "test-route", Map.of("name", "航线跟踪仿真"));
    var windTest = createMbseObject(testCaseType, "test-wind", Map.of("name", "侧风稳定性试验"));
    var rainTest = createMbseObject(testCaseType, "test-rain", Map.of("name", "小雨巡检试验"));
    relateMbse(verifiedByType, routeRequirement, routeTest, "route-verified-by");
    relateMbse(verifiedByType, windRequirement, windTest, "wind-verified-by");
    relateMbse(verifiedByType, rainRequirement, rainTest, "rain-verified-by");

    var routeResult =
        createMbseObject(testResultType, "result-route", Map.of("value", 1.4, "verdict", "pass"));
    var windResult =
        createMbseObject(testResultType, "result-wind", Map.of("value", 6.1, "verdict", "fail"));
    relateMbse(producesType, routeTest, routeResult, "route-produces-pass");
    relateMbse(producesType, windTest, windResult, "wind-produces-fail");
  }

  private Map<String, Object> requirementFields(
      String code, String text, String target, Number marginThreshold) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("code", code);
    fields.put("text", text);
    fields.put("target", target);
    fields.put("margin_threshold", marginThreshold);
    return fields;
  }

  private UUID createTechnicalObject(
      UUID objectTypeId, String keySuffix, Map<String, Object> fields) {
    return createObject(
        TECHNICAL_WORKSPACE, objectTypeId, TECHNICAL_TEMPLATE_CODE, keySuffix, fields);
  }

  private UUID createMbseObject(UUID objectTypeId, String keySuffix, Map<String, Object> fields) {
    return createObject(MBSE_WORKSPACE, objectTypeId, MBSE_TEMPLATE_CODE, keySuffix, fields);
  }

  private void relateTechnical(
      UUID relationTypeId, UUID sourceId, UUID targetId, String keySuffix) {
    relate(
        TECHNICAL_WORKSPACE,
        relationTypeId,
        sourceId,
        targetId,
        TECHNICAL_TEMPLATE_CODE,
        keySuffix);
  }

  private void relateMbse(UUID relationTypeId, UUID sourceId, UUID targetId, String keySuffix) {
    relate(MBSE_WORKSPACE, relationTypeId, sourceId, targetId, MBSE_TEMPLATE_CODE, keySuffix);
  }

  private UUID createObject(UUID objectTypeId, String keySuffix, Map<String, Object> fields) {
    return createObject(DEMO_WORKSPACE, objectTypeId, INTERIOR_TEMPLATE_CODE, keySuffix, fields);
  }

  private UUID createObject(
      UUID workspaceId,
      UUID objectTypeId,
      String templateCode,
      String keySuffix,
      Map<String, Object> fields) {
    var result =
        commands.createObject(
            new CreateObjectCommand(
                workspaceId,
                UUID.randomUUID(),
                key(templateCode, "create-" + keySuffix),
                objectTypeId,
                fields,
                new SourceInfo("manual", "dev-seed"),
                null),
            Actor.user(AUTHOR));
    applyEvents(result);
    return createdObjectId(result);
  }

  private void relate(UUID relationTypeId, UUID sourceId, UUID targetId, String keySuffix) {
    relate(DEMO_WORKSPACE, relationTypeId, sourceId, targetId, INTERIOR_TEMPLATE_CODE, keySuffix);
  }

  private void relate(
      UUID workspaceId,
      UUID relationTypeId,
      UUID sourceId,
      UUID targetId,
      String templateCode,
      String keySuffix) {
    var result =
        commands.createRelation(
            new CreateRelationCommand(
                workspaceId,
                UUID.randomUUID(),
                key(templateCode, keySuffix),
                relationTypeId,
                sourceId,
                targetId,
                Map.of(),
                new SourceInfo("manual", "dev-seed")),
            Actor.user(AUTHOR));
    applyEvents(result);
  }

  private void runRoomRuleChecks() {
    ruleChecks.run(
        new RunRuleCheckRequest(
            DEMO_WORKSPACE,
            UUID.randomUUID(),
            key(INTERIOR_TEMPLATE_CODE, "run-room-rules-" + UUID.randomUUID()),
            new RuleScopeRequest("room", null)));
  }

  private void runTechnicalRuleChecks() {
    runTechnicalRuleCheck("module");
    runTechnicalRuleCheck("interface");
    runTechnicalRuleCheck("requirement");
  }

  private void runMbseRuleChecks() {
    runMbseRuleCheck("env_condition");
    runMbseRuleCheck("requirement");
  }

  private void runTechnicalRuleCheck(String objectTypeCode) {
    ruleChecks.run(
        new RunRuleCheckRequest(
            TECHNICAL_WORKSPACE,
            UUID.randomUUID(),
            key(TECHNICAL_TEMPLATE_CODE, "run-" + objectTypeCode + "-rules-" + UUID.randomUUID()),
            new RuleScopeRequest(objectTypeCode, null)));
  }

  private void runMbseRuleCheck(String objectTypeCode) {
    ruleChecks.run(
        new RunRuleCheckRequest(
            MBSE_WORKSPACE,
            UUID.randomUUID(),
            key(MBSE_TEMPLATE_CODE, "run-" + objectTypeCode + "-rules-" + UUID.randomUUID()),
            new RuleScopeRequest(objectTypeCode, null)));
  }

  private void waitForReadModelRooms() throws InterruptedException {
    var deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (readModelRoomCount() < 6 && System.nanoTime() < deadline) {
      Thread.sleep(500);
    }
    if (readModelRoomCount() < 6) {
      LOG.warn("DEV SEED: read model did not catch up before rule check");
    }
  }

  private void waitForReadModelTechnicalModules() throws InterruptedException {
    var deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (readModelTechnicalModuleCount() < 4 && System.nanoTime() < deadline) {
      Thread.sleep(500);
    }
    if (readModelTechnicalModuleCount() < 4) {
      LOG.warn("DEV SEED: technical read model did not catch up before rule check");
    }
  }

  private void waitForReadModelMbseRequirements() throws InterruptedException {
    var deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (readModelMbseRequirementCount() < 4 && System.nanoTime() < deadline) {
      Thread.sleep(500);
    }
    if (readModelMbseRequirementCount() < 4) {
      LOG.warn("DEV SEED: MBSE read model did not catch up before rule check");
    }
  }

  private int readModelRoomCount() {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM rm_object
            WHERE workspace_id = ? AND object_type_code = 'room'
            """,
            Integer.class,
            DEMO_WORKSPACE);
    return count == null ? 0 : count;
  }

  private int readModelTechnicalModuleCount() {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM rm_object
            WHERE workspace_id = ? AND object_type_code = 'module'
            """,
            Integer.class,
            TECHNICAL_WORKSPACE);
    return count == null ? 0 : count;
  }

  private int readModelMbseRequirementCount() {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM rm_object
            WHERE workspace_id = ? AND object_type_code = 'requirement'
            """,
            Integer.class,
            MBSE_WORKSPACE);
    return count == null ? 0 : count;
  }

  private UUID createdObjectId(CommandResult result) {
    for (var eventId : result.events()) {
      var objectId =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              rows -> rows.next() ? rows.getString(1) : null,
              eventId);
      if (objectId != null) {
        return UUID.fromString(objectId);
      }
    }
    throw new IllegalStateException("CreateObject did not emit ObjectCreated");
  }

  private void applyEvents(CommandResult result) {
    for (var eventId : result.events()) {
      var payload =
          jdbc.query(
              "SELECT payload::text FROM event_outbox WHERE id = ?",
              rows -> rows.next() ? rows.getString(1) : null,
              eventId);
      if (payload == null) continue;
      try {
        projection.apply(mapper.readValue(payload, EventEnvelope.class));
      } catch (Exception failure) {
        throw new IllegalStateException("DEV SEED: read model projection failed", failure);
      }
    }
  }

  private UUID templateId(String code) {
    return jdbc.queryForObject("SELECT id FROM scene_template WHERE code = ?", UUID.class, code);
  }

  private UUID objectType(String code) {
    return objectType(DEMO_WORKSPACE, code);
  }

  private UUID objectType(UUID workspaceId, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspaceId,
        code);
  }

  private UUID relationType(String code) {
    return relationType(DEMO_WORKSPACE, code);
  }

  private UUID relationType(UUID workspaceId, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspaceId,
        code);
  }

  private String key(String templateCode, String suffix) {
    return "dev-seed-" + templateCode + "-" + suffix;
  }
}
