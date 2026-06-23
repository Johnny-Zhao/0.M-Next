package com.mnext.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
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
  private static final String AUTHOR = "11111111-1111-4111-8111-111111111111";
  private static final String TEMPLATE_CODE = "interior_design";

  private final ProfileLoader profileLoader;
  private final TemplateLifecycleService lifecycle;
  private final KernelCommandService commands;
  private final RuleCheckRunner ruleChecks;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  DevSeedRunner(
      ProfileLoader profileLoader,
      TemplateLifecycleService lifecycle,
      KernelCommandService commands,
      RuleCheckRunner ruleChecks,
      JdbcTemplate jdbc,
      ObjectMapper mapper) {
    this.profileLoader = profileLoader;
    this.lifecycle = lifecycle;
    this.commands = commands;
    this.ruleChecks = ruleChecks;
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Override
  public void run(ApplicationArguments args) throws Exception {
    var manifest = interiorManifest();
    var actor = Actor.user(AUTHOR);
    profileLoader.install(manifest, actor);
    ensureDemoWorkspace(manifest, actor);
    if (!demoFloorplanExists()) {
      seedDemoObjects();
    }
  }

  @EventListener(ApplicationReadyEvent.class)
  void runChecksAfterReadModelReady() throws InterruptedException {
    waitForReadModelRooms();
    runRoomRuleChecks();
    LOG.info("DEV SEED: interior-design installed, demo workspace {} ready", DEMO_WORKSPACE);
  }

  private ProfileManifest interiorManifest() throws Exception {
    for (var path : manifestCandidates()) {
      if (Files.exists(path)) {
        try (var input = Files.newInputStream(path)) {
          return mapper.readValue(input, ProfileManifest.class);
        }
      }
    }
    throw new IllegalStateException("DEV SEED: interior profile.manifest.json is not readable");
  }

  private Path[] manifestCandidates() {
    return new Path[] {
      Path.of("packages", "domains", "interior-design", "profile.manifest.json"),
      Path.of("..", "domains", "interior-design", "profile.manifest.json"),
      Path.of("..", "..", "packages", "domains", "interior-design", "profile.manifest.json")
          .normalize()
    };
  }

  private void ensureDemoWorkspace(ProfileManifest manifest, Actor actor) {
    if (workspaceExists(DEMO_WORKSPACE)) {
      return;
    }
    lifecycle.instantiateWorkspace(
        new InstantiateWorkspaceCommand(
            DEMO_WORKSPACE,
            UUID.randomUUID(),
            key("instantiate"),
            templateId(manifest.templateCode()),
            1,
            DEMO_WORKSPACE,
            "室内设计 Demo"),
        actor);
  }

  private boolean workspaceExists(UUID workspaceId) {
    var count =
        jdbc.queryForObject(
            "SELECT count(*) FROM workspace WHERE id = ?", Integer.class, workspaceId);
    return count != null && count > 0;
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
            roomFields("客厅", "客厅", 5.6, 4.2, "S", 5.0, 3.2, 420, 24, 1.2, 0.8, 1.4));
    var master =
        createObject(
            roomType,
            "room-master",
            roomFields("主卧", "卧室", 4.2, 3.6, "E", 2.0, 2.6, 260, 24, 1.3, 0.6, 0.7));
    var second =
        createObject(
            roomType,
            "room-second",
            roomFields("暗次卧", "卧室", 3.4, 3.0, "N", 0.8, 1.4, 120, 22, 1.6, 0.5, 1.1));
    var kitchen =
        createObject(
            roomType,
            "room-kitchen",
            roomFields("厨房", "厨房", 3.2, 2.4, "E", 1.4, 2.8, 320, 25, 1.8, 0.9, 1.2));
    var bath =
        createObject(
            roomType,
            "room-bath",
            roomFields("卫生间", "卫生间", 2.4, 2.0, "N", 0.7, 2.4, 180, 23, 1.7, 0.4, 1.0));
    var study =
        createObject(
            roomType,
            "room-study",
            roomFields("西晒书房", "书房", 3.6, 2.8, "W", 1.8, 2.5, 300, 28, 1.5, 0.7, 1.3));

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

  private UUID createObject(UUID objectTypeId, String keySuffix, Map<String, Object> fields) {
    var result =
        commands.createObject(
            new CreateObjectCommand(
                DEMO_WORKSPACE,
                UUID.randomUUID(),
                key("create-" + keySuffix),
                objectTypeId,
                fields,
                new SourceInfo("manual", "dev-seed"),
                null),
            Actor.user(AUTHOR));
    return createdObjectId(result);
  }

  private void relate(UUID relationTypeId, UUID sourceId, UUID targetId, String keySuffix) {
    commands.createRelation(
        new CreateRelationCommand(
            DEMO_WORKSPACE,
            UUID.randomUUID(),
            key(keySuffix),
            relationTypeId,
            sourceId,
            targetId,
            Map.of(),
            new SourceInfo("manual", "dev-seed")),
        Actor.user(AUTHOR));
  }

  private void runRoomRuleChecks() {
    ruleChecks.run(
        new RunRuleCheckRequest(
            DEMO_WORKSPACE,
            UUID.randomUUID(),
            key("run-room-rules-" + UUID.randomUUID()),
            new RuleScopeRequest("room", null)));
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

  private UUID templateId(String code) {
    return jdbc.queryForObject("SELECT id FROM scene_template WHERE code = ?", UUID.class, code);
  }

  private UUID objectType(String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        DEMO_WORKSPACE,
        code);
  }

  private UUID relationType(String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        DEMO_WORKSPACE,
        code);
  }

  private String key(String suffix) {
    return "dev-seed-" + TEMPLATE_CODE + "-" + suffix;
  }
}
