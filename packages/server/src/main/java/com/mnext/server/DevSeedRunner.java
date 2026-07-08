package com.mnext.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.events.EventEnvelope;
import com.mnext.kernel.api.metamodel.ApplyProfileCommand;
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
  private static final String SYSML_TEMPLATE_CODE = "sysml";
  private static final String SYSML_MBSE_MAPPING_TEMPLATE_CODE = "sysml_mbse_mapping";

  // 富文本正文样本(合法 Tiptap JSON:一个段落 + 一个无序列表),为富文本内容块回归留样(ADR-011)。
  // body 为普通字符串字段,仅承载内容,不参与任何派生与规则。
  private static final String MODULE_BODY_SAMPLE =
      "{\"type\":\"doc\",\"content\":["
          + "{\"type\":\"paragraph\",\"content\":["
          + "{\"type\":\"text\",\"text\":\"电源分系统负责组织太阳阵、蓄电池组与电源负载。\"}]},"
          + "{\"type\":\"bulletList\",\"content\":["
          + "{\"type\":\"listItem\",\"content\":[{\"type\":\"paragraph\",\"content\":["
          + "{\"type\":\"text\",\"text\":\"汇总叶子模块功耗\"}]}]},"
          + "{\"type\":\"listItem\",\"content\":[{\"type\":\"paragraph\",\"content\":["
          + "{\"type\":\"text\",\"text\":\"支撑能源预算校核\"}]}]}]}]}";

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
    if (!mbseSeedRichEnough()) {
      seedMbseObjects();
    }
    var sysmlManifest = sysmlManifest();
    profileLoader.install(sysmlManifest, actor);
    applyProfile(sysmlManifest, actor, MBSE_WORKSPACE);
    var mappingManifest = sysmlMbseMappingManifest();
    profileLoader.install(mappingManifest, actor);
    applyProfile(mappingManifest, actor, MBSE_WORKSPACE);
    if (!sysmlMbseMappingSeedExists()) {
      seedSysmlMbseMappingObjects();
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
    LOG.info("DEV SEED: mbse installed, rich verification demo workspace {} ready", MBSE_WORKSPACE);
    LOG.info("DEV SEED: sysml-mbse mapping applied to workspace {} ready", MBSE_WORKSPACE);
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

  private ProfileManifest sysmlManifest() throws Exception {
    return manifest("sysml", "sysml");
  }

  private ProfileManifest sysmlMbseMappingManifest() throws Exception {
    return manifest("sysml-mbse-mapping", "sysml mbse mapping");
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

  private void applyProfile(ProfileManifest manifest, Actor actor, UUID workspaceId) {
    lifecycle.applyProfile(
        new ApplyProfileCommand(
            workspaceId,
            UUID.randomUUID(),
            key(manifest.templateCode(), "apply-profile"),
            templateId(manifest.templateCode()),
            1),
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

  private boolean mbseSeedRichEnough() {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM data_object object
            JOIN object_type type ON type.id = object.object_type_id
            WHERE object.workspace_id = ? AND type.code = 'requirement'
            """,
            Integer.class,
            MBSE_WORKSPACE);
    return count != null && count >= 12;
  }

  private boolean sysmlMbseMappingSeedExists() {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM data_relation relation
            JOIN relation_type type ON type.id = relation.relation_type_id
            WHERE relation.workspace_id = ?
              AND type.code = 'sysml_requirement_to_mbse_requirement'
              AND relation.status = 'ACTIVE'
            """,
            Integer.class,
            MBSE_WORKSPACE);
    return count != null && count >= 3;
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
    var alternativeType = objectType(TECHNICAL_WORKSPACE, "alternative");
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
    var powerSubsystem =
        createTechnicalObject(
            moduleType,
            "module-power-subsystem",
            technicalModuleFields("电源分系统", "负责卫星电源生成、存储与分配", "卫星电源系统顶层模块"));
    var batteryPack =
        createTechnicalObject(
            moduleType,
            "module-battery-pack",
            technicalModuleFields("蓄电池组", "负责轨道阴影期储能与放电", "电源分系统储能组件"));
    var cellUnit =
        createTechnicalObject(
            moduleType, "module-cell-unit", technicalModuleFields("电芯单元", "提供基础储能单元", "蓄电池组叶子模块"));
    var solarArraySubsystem =
        createTechnicalObject(
            moduleType,
            "module-solar-array-subsystem",
            technicalModuleFields("太阳阵分系统", "负责在光照段发电并给蓄电池充电", "电源分系统发电子系统"));
    var solarPanel =
        createTechnicalObject(
            moduleType,
            "module-solar-panel",
            technicalModuleFields("太阳电池板", "完成光电转换并输出母线功率", "太阳阵叶子模块"));
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
    createTechnicalObject(
        alternativeType,
        "alternative-cost",
        technicalAlternativeFields("成本优先方案", 82, "硬件功耗最低，适合预算严格场景"));
    createTechnicalObject(
        alternativeType,
        "alternative-balanced",
        technicalAlternativeFields("均衡推荐方案", 91, "功耗略高但交付风险最低，建议作为当前基线"));
    createTechnicalObject(
        alternativeType,
        "alternative-performance",
        technicalAlternativeFields("性能优先方案", 87, "吞吐能力最好，需配合预算调整"));

    relateTechnical(containsSystemType, proposal, platformSystem, "contains-platform-system");
    relateTechnical(containsSystemType, proposal, integrationSystem, "contains-integration-system");
    relateTechnical(
        containsModuleType, proposal, powerSubsystem, "proposal-contains-power-subsystem");
    relateTechnical(containsModuleType, powerSubsystem, batteryPack, "power-contains-battery-pack");
    relateTechnical(containsModuleType, batteryPack, cellUnit, "battery-contains-cell-unit");
    relateTechnical(
        containsModuleType, powerSubsystem, solarArraySubsystem, "power-contains-solar-array");
    relateTechnical(
        containsModuleType, solarArraySubsystem, solarPanel, "solar-array-contains-panel");
    relateTechnical(containsModuleType, proposal, undecided, "proposal-contains-undecided");
    relateTechnical(dependsOnType, solarPanel, batteryPack, "solar-panel-depends-battery-pack");
    relateTechnical(interfacesWithType, powerSubsystem, exportInterface, "power-subsystem-export");
    relateTechnical(interfacesWithType, solarPanel, reviewInterface, "solar-panel-review");
    relateTechnical(satisfiesType, powerSubsystem, coveredRequirement, "power-subsystem-satisfies");
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

  private Map<String, Object> technicalAlternativeFields(
      String name, Number score, String conclusion) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("name", name);
    fields.put("score", score);
    fields.put("conclusion", conclusion);
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
    var analysisPhase = createMbseObject(phaseType, "phase-analysis", Map.of("name", "结果回传"));
    var wind =
        createMbseObject(
            conditionType, "condition-wind", Map.of("name", "侧风工况", "value", "侧风 <= 10m/s"));
    var rain =
        createMbseObject(conditionType, "condition-rain", Map.of("name", "降雨工况", "value", "小雨可运行"));
    var linkLoss =
        createMbseObject(
            conditionType, "condition-link-loss", Map.of("name", "链路退化", "value", "丢包率 <= 8%"));
    var navigation =
        createMbseObject(capabilityType, "capability-navigation", Map.of("name", "自主导航"));
    var resilience =
        createMbseObject(capabilityType, "capability-resilience", Map.of("name", "环境适应"));
    var sensing = createMbseObject(capabilityType, "capability-sensing", Map.of("name", "载荷感知"));
    var safetyReturn =
        createMbseObject(capabilityType, "capability-safety-return", Map.of("name", "安全返航"));

    relateMbse(occursInType, launchPhase, mission, "launch-occurs-in");
    relateMbse(occursInType, patrolPhase, mission, "patrol-occurs-in");
    relateMbse(occursInType, analysisPhase, mission, "analysis-occurs-in");
    relateMbse(imposesType, launchPhase, wind, "launch-imposes-wind");
    relateMbse(imposesType, patrolPhase, rain, "patrol-imposes-rain");
    relateMbse(imposesType, analysisPhase, linkLoss, "analysis-imposes-link-loss");
    relateMbse(requiresType, context, navigation, "context-requires-navigation");
    relateMbse(requiresType, context, resilience, "context-requires-resilience");
    relateMbse(requiresType, context, sensing, "context-requires-sensing");
    relateMbse(requiresType, context, safetyReturn, "context-requires-safety-return");

    var routeRequirement =
        createMbseObject(
            requirementType,
            "requirement-route",
            requirementFields("REQ-MBSE-001", "系统应按规划航线自主巡检", "1.5", 0.2));
    var windRequirement =
        createMbseObject(
            requirementType,
            "requirement-wind",
            requirementFields("REQ-MBSE-002", "系统应在侧风下保持姿态稳定", "5.0", 0.15));
    var rainRequirement =
        createMbseObject(
            requirementType,
            "requirement-rain",
            requirementFields("REQ-MBSE-003", "系统应在小雨环境完成巡检", "0.95", 0.1));
    var recoveryRequirement =
        createMbseObject(
            requirementType,
            "requirement-recovery",
            requirementFields("REQ-MBSE-004", "链路中断后系统应安全返航", "3.0", 0.25));
    var signalRequirement =
        createMbseObject(
            requirementType,
            "requirement-signal",
            requirementFields("REQ-MBSE-005", "系统应在弱链路下维持航迹上传", "0.8", 0.2));
    var geofenceRequirement =
        createMbseObject(
            requirementType,
            "requirement-geofence",
            requirementFields("REQ-MBSE-006", "系统不得越过电子围栏", "0.0", 0.0));
    var batteryRequirement =
        createMbseObject(
            requirementType,
            "requirement-battery",
            requirementFields("REQ-MBSE-007", "系统应保留返航电量裕度", "31.0", 0.1));
    var rerouteRequirement =
        createMbseObject(
            requirementType,
            "requirement-reroute",
            requirementFields("REQ-MBSE-008", "系统应绕开临时禁飞区", "5.0", 0.2));
    var imageRequirement =
        createMbseObject(
            requirementType,
            "requirement-image",
            requirementFields("REQ-MBSE-009", "载荷应采集可判读巡检图像", "0.9", 0.1));
    var hotspotRequirement =
        createMbseObject(
            requirementType,
            "requirement-hotspot",
            requirementFields("REQ-MBSE-010", "系统应识别热异常点", "0.9", 0.1));
    var syncRequirement =
        createMbseObject(
            requirementType,
            "requirement-sync",
            requirementFields("REQ-MBSE-011", "图像与遥测应时间同步", "0.2", 0.15));
    var returnRequirement =
        createMbseObject(
            requirementType,
            "requirement-return",
            requirementFields("REQ-MBSE-012", "失联后应自动进入返航模式", "2.5", 0.25));
    var landingRequirement =
        createMbseObject(
            requirementType,
            "requirement-landing",
            requirementFields("REQ-MBSE-013", "返航后应安全降落", "1.5", 0.2));
    var reportRequirement =
        createMbseObject(
            requirementType,
            "requirement-report",
            requirementFields("REQ-MBSE-014", "任务结束后应生成验证摘要", "60.0", 0.15));

    relateMbse(derivesType, navigation, routeRequirement, "navigation-derives-route");
    relateMbse(derivesType, navigation, windRequirement, "navigation-derives-wind");
    relateMbse(derivesType, navigation, signalRequirement, "navigation-derives-signal");
    relateMbse(derivesType, navigation, geofenceRequirement, "navigation-derives-geofence");
    relateMbse(derivesType, resilience, rainRequirement, "resilience-derives-rain");
    relateMbse(derivesType, resilience, recoveryRequirement, "resilience-derives-recovery");
    relateMbse(derivesType, resilience, batteryRequirement, "resilience-derives-battery");
    relateMbse(derivesType, resilience, rerouteRequirement, "resilience-derives-reroute");
    relateMbse(derivesType, sensing, imageRequirement, "sensing-derives-image");
    relateMbse(derivesType, sensing, hotspotRequirement, "sensing-derives-hotspot");
    relateMbse(derivesType, sensing, syncRequirement, "sensing-derives-sync");
    relateMbse(derivesType, safetyReturn, returnRequirement, "safety-return-derives-return");
    relateMbse(derivesType, safetyReturn, landingRequirement, "safety-return-derives-landing");
    relateMbse(derivesType, safetyReturn, reportRequirement, "safety-return-derives-report");

    var routeTest = createMbseObject(testCaseType, "test-route", Map.of("name", "航线跟踪仿真"));
    var windTest = createMbseObject(testCaseType, "test-wind", Map.of("name", "侧风稳定性试验"));
    var rainTest = createMbseObject(testCaseType, "test-rain", Map.of("name", "小雨巡检试验"));
    var signalTest = createMbseObject(testCaseType, "test-signal", Map.of("name", "弱链路遥测试验"));
    var geofenceTest = createMbseObject(testCaseType, "test-geofence", Map.of("name", "电子围栏越界试验"));
    var batteryTest = createMbseObject(testCaseType, "test-battery", Map.of("name", "返航电量裕度试验"));
    var imageTest = createMbseObject(testCaseType, "test-image", Map.of("name", "巡检图像判读试验"));
    var hotspotTest = createMbseObject(testCaseType, "test-hotspot", Map.of("name", "热异常识别试验"));
    var syncTest = createMbseObject(testCaseType, "test-sync", Map.of("name", "图像遥测同步试验"));
    var returnTest = createMbseObject(testCaseType, "test-return", Map.of("name", "失联返航触发试验"));
    var landingTest = createMbseObject(testCaseType, "test-landing", Map.of("name", "返航降落试验"));
    relateMbse(verifiedByType, routeRequirement, routeTest, "route-verified-by");
    relateMbse(verifiedByType, windRequirement, windTest, "wind-verified-by");
    relateMbse(verifiedByType, rainRequirement, rainTest, "rain-verified-by");
    relateMbse(verifiedByType, signalRequirement, signalTest, "signal-verified-by");
    relateMbse(verifiedByType, geofenceRequirement, geofenceTest, "geofence-verified-by");
    relateMbse(verifiedByType, batteryRequirement, batteryTest, "battery-verified-by");
    relateMbse(verifiedByType, imageRequirement, imageTest, "image-verified-by");
    relateMbse(verifiedByType, hotspotRequirement, hotspotTest, "hotspot-verified-by");
    relateMbse(verifiedByType, syncRequirement, syncTest, "sync-verified-by");
    relateMbse(verifiedByType, returnRequirement, returnTest, "return-verified-by");
    relateMbse(verifiedByType, landingRequirement, landingTest, "landing-verified-by");

    var routeResult =
        createMbseObject(testResultType, "result-route", Map.of("value", 1.4, "verdict", "pass"));
    var windResult =
        createMbseObject(testResultType, "result-wind", Map.of("value", 6.1, "verdict", "fail"));
    var signalResult =
        createMbseObject(testResultType, "result-signal", Map.of("value", 0.7, "verdict", "pass"));
    var geofenceResult =
        createMbseObject(
            testResultType, "result-geofence", Map.of("value", 0.4, "verdict", "fail"));
    var batteryResult =
        createMbseObject(
            testResultType, "result-battery", Map.of("value", 31.0, "verdict", "pass"));
    var imageResult =
        createMbseObject(testResultType, "result-image", Map.of("value", 0.91, "verdict", "pass"));
    var hotspotResult =
        createMbseObject(
            testResultType, "result-hotspot", Map.of("value", 0.84, "verdict", "fail"));
    var returnResult =
        createMbseObject(testResultType, "result-return", Map.of("value", 2.4, "verdict", "pass"));
    var landingResult =
        createMbseObject(testResultType, "result-landing", Map.of("value", 2.1, "verdict", "fail"));
    relateMbse(producesType, routeTest, routeResult, "route-produces-pass");
    relateMbse(producesType, windTest, windResult, "wind-produces-fail");
    relateMbse(producesType, signalTest, signalResult, "signal-produces-pass");
    relateMbse(producesType, geofenceTest, geofenceResult, "geofence-produces-fail");
    relateMbse(producesType, batteryTest, batteryResult, "battery-produces-pass");
    relateMbse(producesType, imageTest, imageResult, "image-produces-pass");
    relateMbse(producesType, hotspotTest, hotspotResult, "hotspot-produces-fail");
    relateMbse(producesType, returnTest, returnResult, "return-produces-pass");
    relateMbse(producesType, landingTest, landingResult, "landing-produces-fail");
  }

  private void seedSysmlMbseMappingObjects() {
    var sysmlRequirementType = objectType(MBSE_WORKSPACE, "sysml_requirement");
    var mapsType = relationType(MBSE_WORKSPACE, "sysml_requirement_to_mbse_requirement");
    var route =
        createSysmlObject(
            sysmlRequirementType,
            "requirement-route",
            sysmlRequirementFields("SYSML-REQ-001", "Aircraft shall follow the planned route"));
    var wind =
        createSysmlObject(
            sysmlRequirementType,
            "requirement-wind",
            sysmlRequirementFields("SYSML-REQ-002", "Aircraft shall remain stable in crosswind"));
    var image =
        createSysmlObject(
            sysmlRequirementType,
            "requirement-image",
            sysmlRequirementFields("SYSML-REQ-003", "Payload shall capture inspectable imagery"));
    createSysmlObject(
        sysmlRequirementType,
        "requirement-unmapped",
        sysmlRequirementFields("SYSML-REQ-004", "Mission shall export a verification report"));

    relateMapping(mapsType, route, mbseRequirement("REQ-MBSE-001"), "route-to-mbse");
    relateMapping(mapsType, wind, mbseRequirement("REQ-MBSE-002"), "wind-to-mbse");
    relateMapping(mapsType, image, mbseRequirement("REQ-MBSE-009"), "image-to-mbse");
  }

  private Map<String, Object> sysmlRequirementFields(String reqId, String text) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("name", reqId);
    fields.put("req_id", reqId);
    fields.put("text", text);
    return fields;
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
        TECHNICAL_WORKSPACE,
        objectTypeId,
        TECHNICAL_TEMPLATE_CODE,
        keySuffix,
        technicalSeedFields(keySuffix, fields));
  }

  private Map<String, Object> technicalSeedFields(String keySuffix, Map<String, Object> fields) {
    var result = new LinkedHashMap<String, Object>(fields);
    switch (keySuffix) {
      case "proposal" -> result.put("power_budget_w", 800);
      case "module-power-subsystem" ->
          result.put("body", MODULE_BODY_SAMPLE); // 回归留样:富文本正文(不参与派生/规则)
      case "module-cell-unit" -> result.put("power_w", 360);
      case "module-solar-panel" -> result.put("power_w", 320);
      case "module-undecided" -> result.put("power_w", 160);
      default -> {}
    }
    return result;
  }

  private UUID createMbseObject(UUID objectTypeId, String keySuffix, Map<String, Object> fields) {
    return createObject(MBSE_WORKSPACE, objectTypeId, MBSE_TEMPLATE_CODE, keySuffix, fields);
  }

  private UUID createSysmlObject(UUID objectTypeId, String keySuffix, Map<String, Object> fields) {
    return createObject(MBSE_WORKSPACE, objectTypeId, SYSML_TEMPLATE_CODE, keySuffix, fields);
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

  private void relateMapping(UUID relationTypeId, UUID sourceId, UUID targetId, String keySuffix) {
    relate(
        MBSE_WORKSPACE,
        relationTypeId,
        sourceId,
        targetId,
        SYSML_MBSE_MAPPING_TEMPLATE_CODE,
        keySuffix);
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
    var idempotencyKey = key(templateCode, "create-" + keySuffix);
    var existingObjectId = createdObjectId(workspaceId, idempotencyKey);
    if (existingObjectId != null) {
      return existingObjectId;
    }
    var result =
        commands.createObject(
            new CreateObjectCommand(
                workspaceId,
                UUID.randomUUID(),
                idempotencyKey,
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
    runTechnicalRuleCheck("proposal");
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
    while (readModelMbseRequirementCount() < 12 && System.nanoTime() < deadline) {
      Thread.sleep(500);
    }
    if (readModelMbseRequirementCount() < 12) {
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

  private UUID createdObjectId(UUID workspaceId, String idempotencyKey) {
    var eventIds =
        jdbc.query(
            """
            SELECT jsonb_array_elements_text(result_snapshot->'events')
            FROM command_log
            WHERE workspace_id = ? AND idempotency_key = ? AND command_type = 'CreateObject'
            """,
            (rows, ignored) -> rows.getString(1),
            workspaceId,
            idempotencyKey);
    for (var eventId : eventIds) {
      var objectId =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              rows -> rows.next() ? rows.getString(1) : null,
              eventId);
      if (objectId != null) {
        return UUID.fromString(objectId);
      }
    }
    return null;
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

  private UUID mbseRequirement(String code) {
    return jdbc.queryForObject(
        """
        SELECT object.id
        FROM data_object object
        JOIN object_type type ON type.id = object.object_type_id
        JOIN data_field_value value ON value.object_id = object.id
        JOIN field_def field ON field.id = value.field_def_id
        WHERE object.workspace_id = ?
          AND type.code = 'requirement'
          AND field.code = 'code'
          AND value.value #>> '{}' = ?
        """,
        UUID.class,
        MBSE_WORKSPACE,
        code);
  }

  private String key(String templateCode, String suffix) {
    return "dev-seed-" + templateCode + "-" + suffix;
  }
}
