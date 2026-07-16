package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.commands.FieldUpdate;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import com.mnext.kernel.api.events.EventEnvelope;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import com.mnext.server.plugin.ProfileManifest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Profile("dev")
class PcProcurementDevSeeder implements ApplicationRunner {
  static final UUID WORKSPACE_ID = UUID.fromString("55555555-5555-4555-8555-555555555555");
  private static final Logger LOG = LoggerFactory.getLogger(PcProcurementDevSeeder.class);
  private static final String TEMPLATE_CODE = "pc_procurement";
  private static final String AUTHOR = ProfileLoader.AUTHOR_WORKSPACE.toString();

  private final ProfileLoader profileLoader;
  private final TemplateLifecycleService lifecycle;
  private final KernelCommandService commands;
  private final ReadModelProjection projection;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  PcProcurementDevSeeder(
      ProfileLoader profileLoader,
      TemplateLifecycleService lifecycle,
      KernelCommandService commands,
      ReadModelProjection projection,
      JdbcTemplate jdbc,
      ObjectMapper mapper) {
    this.profileLoader = profileLoader;
    this.lifecycle = lifecycle;
    this.commands = commands;
    this.projection = projection;
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Override
  public void run(ApplicationArguments args) throws Exception {
    var manifest = manifest();
    var actor = Actor.user(AUTHOR);
    profileLoader.install(manifest, actor);
    ensureWorkspace(manifest, actor);
    seedObjectsAndRelations();
    LOG.info("DEV SEED: pc-procurement installed, demo workspace {} ready", WORKSPACE_ID);
  }

  private ProfileManifest manifest() throws Exception {
    for (var path : manifestCandidates()) {
      if (Files.exists(path)) {
        try (var input = Files.newInputStream(path)) {
          return mapper.readValue(input, ProfileManifest.class);
        }
      }
    }
    throw new IllegalStateException(
        "DEV SEED: pc-procurement profile.manifest.json is not readable");
  }

  private Path[] manifestCandidates() {
    return new Path[] {
      Path.of("packages", "domains", "pc-procurement", "profile.manifest.json"),
      Path.of("..", "domains", "pc-procurement", "profile.manifest.json"),
      Path.of("..", "..", "packages", "domains", "pc-procurement", "profile.manifest.json")
          .normalize()
    };
  }

  private void ensureWorkspace(ProfileManifest manifest, Actor actor) {
    if (workspaceExists()) {
      if (!runtimeTypeExists("procurement_requirement")) {
        throw new IllegalStateException(
            "DEV SEED: pc procurement workspace exists without its runtime profile");
      }
      ensureRuntimeProfileMatches(manifest);
      return;
    }
    lifecycle.instantiateWorkspace(
        new InstantiateWorkspaceCommand(
            ProfileLoader.AUTHOR_WORKSPACE,
            UUID.randomUUID(),
            key("instantiate"),
            templateId(),
            1,
            WORKSPACE_ID,
            "电脑采购 Demo"),
        actor);
    ensureRuntimeProfileMatches(manifest);
  }

  private void ensureRuntimeProfileMatches(ProfileManifest manifest) {
    var expected = enumValues(manifest, "hardware_product", "category");
    var actual = runtimeEnumValues("hardware_product", "category");
    if (expected.equals(actual)) return;
    throw new IllegalStateException(
        "DEV SEED: pc-procurement workspace profile drift for hardware_product.category; "
            + "expected "
            + expected
            + " but found "
            + actual
            + ". For the local development database only, run corepack pnpm dev:down, docker compose down, "
            + "confirm m-next_postgres-data, remove that volume, then run corepack pnpm dev:up.");
  }

  private Set<String> enumValues(ProfileManifest manifest, String objectType, String fieldCode) {
    return manifest.fieldsOrEmpty().stream()
        .filter(field -> objectType.equals(field.objectType()) && fieldCode.equals(field.code()))
        .findFirst()
        .map(ProfileManifest.Field::constraints)
        .map(this::enumValues)
        .orElseThrow(
            () ->
                new IllegalStateException(
                    "DEV SEED: pc-procurement manifest is missing "
                        + objectType
                        + "."
                        + fieldCode));
  }

  private Set<String> runtimeEnumValues(String objectType, String fieldCode) {
    var constraints =
        jdbc.query(
            """
            SELECT field.constraints::text
            FROM object_type type
            JOIN field_def field ON field.object_type_id = type.id
            WHERE type.workspace_id = ?
              AND type.template_version_id IS NULL
              AND type.code = ?
              AND field.code = ?
            """,
            result -> result.next() ? result.getString(1) : null,
            WORKSPACE_ID,
            objectType,
            fieldCode);
    if (constraints == null) return Set.of();
    try {
      return enumValues(mapper.readTree(constraints));
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalStateException(
          "DEV SEED: runtime profile constraints are unreadable", failure);
    }
  }

  private Set<String> enumValues(JsonNode constraints) {
    var values = new LinkedHashSet<String>();
    constraints.path("enumValues").forEach(value -> values.add(value.asText()));
    return Set.copyOf(values);
  }

  private boolean workspaceExists() {
    var count =
        jdbc.queryForObject(
            "SELECT count(*) FROM workspace WHERE id = ?", Integer.class, WORKSPACE_ID);
    return count != null && count > 0;
  }

  private boolean runtimeTypeExists(String code) {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM object_type
            WHERE workspace_id = ? AND template_version_id IS NULL AND code = ?
            """,
            Integer.class,
            WORKSPACE_ID,
            code);
    return count != null && count > 0;
  }

  private void seedObjectsAndRelations() {
    var requirement =
        createObject(
            "procurement_requirement",
            fields(
                "code",
                "REQ-PC-001",
                "name",
                "研发工作站采购需求",
                "budget_cny",
                10000,
                "max_total_power_w",
                650));

    var plans = new LinkedHashMap<String, UUID>();
    plans.put(
        "PLAN-PC-VALID",
        createObject(
            "build_plan",
            fields(
                "code",
                "PLAN-PC-VALID",
                "name",
                "兼容工作站方案",
                "status",
                "PROPOSED",
                "body",
                body("兼容工作站采购方案说明"))));
    plans.put(
        "PLAN-PC-INVALID",
        createObject(
            "build_plan",
            fields(
                "code",
                "PLAN-PC-INVALID",
                "name",
                "超预算不兼容方案",
                "status",
                "PROPOSED",
                "body",
                body("超预算不兼容方案说明"))));

    ensureBody(plans.get("PLAN-PC-VALID"), "PLAN-PC-VALID", "兼容工作站采购方案说明");
    ensureBody(plans.get("PLAN-PC-INVALID"), "PLAN-PC-INVALID", "超预算不兼容方案说明");

    for (var plan : plans.entrySet()) {
      relate(
          "build_plan_satisfies_requirement",
          plan.getValue(),
          requirement,
          "satisfies-" + plan.getKey());
    }

    var products = seedProducts();
    var suppliers = seedSuppliers();
    var quotes = seedQuotes(products, suppliers);
    seedPlanItems(plans, products, quotes);
  }

  private Map<String, UUID> seedProducts() {
    var products = new LinkedHashMap<String, UUID>();
    addProduct(
        products, "HW-CPU-I5-14600K", "Intel Core i5-14600K", "CPU", 1819, 85, 125, null, 1700, 5);
    addProduct(products, "HW-CPU-R7-7700", "AMD Ryzen 7 7700", "CPU", 1999, 82, 65, null, 5, 5);
    addProduct(
        products, "HW-MB-B760-DDR5", "B760 DDR5 主板", "MAINBOARD", 1099, 75, 45, null, 1700, 5);
    addProduct(products, "HW-MB-B650-DDR5", "B650 DDR5 主板", "MAINBOARD", 1299, 78, 50, null, 5, 5);
    addProduct(products, "HW-RAM-DDR5-32G", "DDR5 32GB 内存", "MEMORY", 699, 80, 10, null, null, 5);
    addProduct(products, "HW-RAM-DDR4-32G", "DDR4 32GB 内存", "MEMORY", 499, 60, 8, null, null, 4);
    addProduct(
        products, "HW-GPU-RTX4070", "GeForce RTX 4070", "GPU", 4399, 92, 200, null, null, null);
    addProduct(
        products, "HW-GPU-RX7800XT", "Radeon RX 7800 XT", "GPU", 3999, 88, 263, null, null, null);
    addProduct(products, "HW-PSU-750W", "750W 金牌电源", "PSU", 699, 80, 0, 750, null, null);
    addProduct(products, "HW-PSU-550W", "550W 铜牌电源", "PSU", 399, 55, 0, 550, null, null);
    addProduct(products, "HW-SSD-1TB", "1TB NVMe 固态硬盘", "STORAGE", 499, 78, 6, null, null, null);
    addProduct(products, "HW-SSD-2TB", "2TB NVMe 固态硬盘", "STORAGE", 799, 88, 8, null, null, null);
    addProduct(products, "HW-CASE-MID-ATX", "ATX 中塔机箱", "CASE", 399, 70, 0, null, null, null);
    addProduct(products, "HW-CASE-COMPACT-MATX", "mATX 紧凑机箱", "CASE", 299, 60, 0, null, null, null);
    return products;
  }

  private void addProduct(
      Map<String, UUID> products,
      String code,
      String name,
      String category,
      Number referencePrice,
      Number performanceScore,
      Number power,
      Number powerSupplyCapacity,
      Number cpuMainboardPlatform,
      Number memoryPlatform) {
    var productFields =
        fields(
            "code", code,
            "name", name,
            "category", category,
            "reference_price_cny", referencePrice,
            "performance_score", performanceScore,
            "power_w", power);
    if (powerSupplyCapacity != null) {
      productFields.put("psu_capacity_w", powerSupplyCapacity);
    }
    if (cpuMainboardPlatform != null) {
      productFields.put("cpu_mainboard_platform_code", cpuMainboardPlatform);
    }
    if (memoryPlatform != null) {
      productFields.put("memory_platform_code", memoryPlatform);
    }
    products.put(code, createObject("hardware_product", productFields));
  }

  private Map<String, UUID> seedSuppliers() {
    var suppliers = new LinkedHashMap<String, UUID>();
    suppliers.put(
        "SUP-NORTH", createObject("supplier", fields("code", "SUP-NORTH", "name", "华北数码供应商")));
    suppliers.put(
        "SUP-EAST", createObject("supplier", fields("code", "SUP-EAST", "name", "华东硬件供应商")));
    suppliers.put(
        "SUP-SOUTH", createObject("supplier", fields("code", "SUP-SOUTH", "name", "华南组件供应商")));
    return suppliers;
  }

  private Map<String, UUID> seedQuotes(Map<String, UUID> products, Map<String, UUID> suppliers) {
    var quotes = new LinkedHashMap<String, UUID>();
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-CPU-I5",
        "华北 i5 报价",
        1699,
        20,
        3,
        "HW-CPU-I5-14600K",
        "SUP-NORTH");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-MB-B760",
        "华东 B760 报价",
        999,
        15,
        5,
        "HW-MB-B760-DDR5",
        "SUP-EAST");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-RAM-DDR5",
        "华南 DDR5 报价",
        579,
        30,
        4,
        "HW-RAM-DDR5-32G",
        "SUP-SOUTH");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-GPU-RTX4070",
        "华北 RTX4070 报价",
        4099,
        4,
        7,
        "HW-GPU-RTX4070",
        "SUP-NORTH");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-PSU-750",
        "华东 750W 电源报价",
        599,
        12,
        3,
        "HW-PSU-750W",
        "SUP-EAST");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-MB-B650",
        "华南 B650 报价",
        1199,
        9,
        6,
        "HW-MB-B650-DDR5",
        "SUP-SOUTH");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-RAM-DDR4",
        "华东 DDR4 报价",
        429,
        18,
        2,
        "HW-RAM-DDR4-32G",
        "SUP-EAST");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-PSU-550",
        "华南 550W 电源报价",
        359,
        10,
        5,
        "HW-PSU-550W",
        "SUP-SOUTH");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-SSD-1TB",
        "华东 1TB SSD 报价",
        459,
        20,
        3,
        "HW-SSD-1TB",
        "SUP-EAST");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-SSD-2TB",
        "华南 2TB SSD 报价",
        729,
        12,
        6,
        "HW-SSD-2TB",
        "SUP-SOUTH");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-CASE-MID",
        "华北中塔机箱报价",
        349,
        10,
        4,
        "HW-CASE-MID-ATX",
        "SUP-NORTH");
    addQuote(
        quotes,
        products,
        suppliers,
        "Q-CASE-COMPACT",
        "华南紧凑机箱报价",
        259,
        8,
        5,
        "HW-CASE-COMPACT-MATX",
        "SUP-SOUTH");
    return quotes;
  }

  private void addQuote(
      Map<String, UUID> quotes,
      Map<String, UUID> products,
      Map<String, UUID> suppliers,
      String code,
      String name,
      Number unitPrice,
      Number inventory,
      Number deliveryDays,
      String productCode,
      String supplierCode) {
    var quote =
        createObject(
            "supplier_quote",
            fields(
                "code", code,
                "name", name,
                "unit_price_cny", unitPrice,
                "inventory_qty", inventory,
                "delivery_days", deliveryDays));
    quotes.put(code, quote);
    relate(
        "supplier_quote_for_product",
        quote,
        required(products, productCode),
        "quote-product-" + code);
    relate(
        "supplier_quote_offered_by_supplier",
        quote,
        required(suppliers, supplierCode),
        "quote-supplier-" + code);
  }

  private void seedPlanItems(
      Map<String, UUID> plans, Map<String, UUID> products, Map<String, UUID> quotes) {
    addItem(
        plans,
        products,
        quotes,
        "ITEM-V-CPU",
        "兼容方案 CPU",
        1,
        "PLAN-PC-VALID",
        "HW-CPU-I5-14600K",
        "Q-CPU-I5");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-V-MB",
        "兼容方案主板",
        1,
        "PLAN-PC-VALID",
        "HW-MB-B760-DDR5",
        "Q-MB-B760");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-V-RAM",
        "兼容方案内存",
        1,
        "PLAN-PC-VALID",
        "HW-RAM-DDR5-32G",
        "Q-RAM-DDR5");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-V-GPU",
        "兼容方案显卡",
        1,
        "PLAN-PC-VALID",
        "HW-GPU-RTX4070",
        "Q-GPU-RTX4070");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-V-PSU",
        "兼容方案电源",
        1,
        "PLAN-PC-VALID",
        "HW-PSU-750W",
        "Q-PSU-750");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-V-SSD",
        "兼容方案存储",
        1,
        "PLAN-PC-VALID",
        "HW-SSD-1TB",
        "Q-SSD-1TB");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-V-CASE",
        "兼容方案机箱",
        1,
        "PLAN-PC-VALID",
        "HW-CASE-MID-ATX",
        "Q-CASE-MID");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-X-CPU",
        "不兼容方案 CPU",
        1,
        "PLAN-PC-INVALID",
        "HW-CPU-I5-14600K",
        "Q-CPU-I5");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-X-MB",
        "不兼容方案主板",
        1,
        "PLAN-PC-INVALID",
        "HW-MB-B650-DDR5",
        "Q-MB-B650");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-X-RAM",
        "不兼容方案内存",
        1,
        "PLAN-PC-INVALID",
        "HW-RAM-DDR4-32G",
        "Q-RAM-DDR4");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-X-GPU",
        "超预算方案显卡",
        2,
        "PLAN-PC-INVALID",
        "HW-GPU-RTX4070",
        "Q-GPU-RTX4070");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-X-PSU",
        "不兼容方案电源",
        1,
        "PLAN-PC-INVALID",
        "HW-PSU-550W",
        "Q-PSU-550");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-X-SSD",
        "反例方案存储",
        1,
        "PLAN-PC-INVALID",
        "HW-SSD-2TB",
        "Q-SSD-2TB");
    addItem(
        plans,
        products,
        quotes,
        "ITEM-X-CASE",
        "反例方案机箱",
        1,
        "PLAN-PC-INVALID",
        "HW-CASE-COMPACT-MATX",
        "Q-CASE-COMPACT");
  }

  private void addItem(
      Map<String, UUID> plans,
      Map<String, UUID> products,
      Map<String, UUID> quotes,
      String code,
      String name,
      Number quantity,
      String planCode,
      String productCode,
      String quoteCode) {
    var item =
        createObject("build_plan_item", fields("code", code, "name", name, "quantity", quantity));
    relate("build_plan_contains_item", required(plans, planCode), item, "plan-item-" + code);
    relate(
        "build_plan_item_selects_product",
        item,
        required(products, productCode),
        "item-product-" + code);
    relate(
        "build_plan_item_uses_supplier_quote",
        item,
        required(quotes, quoteCode),
        "item-quote-" + code);
  }

  private UUID createObject(String objectTypeCode, Map<String, Object> fields) {
    var code = String.valueOf(fields.get("code"));
    var idempotencyKey = key("create-" + code);
    var existing = createdObjectId(idempotencyKey);
    if (existing != null) {
      return existing;
    }
    var result =
        commands.createObject(
            new CreateObjectCommand(
                WORKSPACE_ID,
                UUID.randomUUID(),
                idempotencyKey,
                objectType(objectTypeCode),
                fields,
                new SourceInfo("manual", "dev-seed"),
                null),
            Actor.user(AUTHOR));
    applyEvents(result);
    return createdObjectId(result);
  }

  private void relate(String relationTypeCode, UUID sourceId, UUID targetId, String keySuffix) {
    var idempotencyKey = key(keySuffix);
    if (commandExists(idempotencyKey, "CreateRelation")) {
      return;
    }
    var result =
        commands.createRelation(
            new CreateRelationCommand(
                WORKSPACE_ID,
                UUID.randomUUID(),
                idempotencyKey,
                relationType(relationTypeCode),
                sourceId,
                targetId,
                Map.of(),
                new SourceInfo("manual", "dev-seed")),
            Actor.user(AUTHOR));
    applyEvents(result);
  }

  private UUID createdObjectId(String idempotencyKey) {
    var eventIds =
        jdbc.query(
            """
            SELECT jsonb_array_elements_text(result_snapshot->'events')
            FROM command_log
            WHERE workspace_id = ? AND idempotency_key = ? AND command_type = 'CreateObject'
            """,
            (rows, ignored) -> rows.getString(1),
            WORKSPACE_ID,
            idempotencyKey);
    for (var eventId : eventIds) {
      var objectId = objectIdFromEvent(eventId);
      if (objectId != null) {
        return objectId;
      }
    }
    return null;
  }

  private UUID createdObjectId(CommandResult result) {
    for (var eventId : result.events()) {
      var objectId = objectIdFromEvent(eventId);
      if (objectId != null) {
        return objectId;
      }
    }
    throw new IllegalStateException("CreateObject did not emit ObjectCreated");
  }

  private UUID objectIdFromEvent(String eventId) {
    var objectId =
        jdbc.query(
            "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
            rows -> rows.next() ? rows.getString(1) : null,
            eventId);
    return objectId == null ? null : UUID.fromString(objectId);
  }

  private boolean commandExists(String idempotencyKey, String commandType) {
    var count =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM command_log
            WHERE workspace_id = ? AND idempotency_key = ? AND command_type = ?
            """,
            Integer.class,
            WORKSPACE_ID,
            idempotencyKey,
            commandType);
    return count != null && count > 0;
  }

  private void applyEvents(CommandResult result) {
    for (var eventId : result.events()) {
      var payload =
          jdbc.query(
              "SELECT payload::text FROM event_outbox WHERE id = ?",
              rows -> rows.next() ? rows.getString(1) : null,
              eventId);
      if (payload == null) {
        continue;
      }
      try {
        projection.apply(mapper.readValue(payload, EventEnvelope.class));
      } catch (Exception failure) {
        throw new IllegalStateException("DEV SEED: pc procurement projection failed", failure);
      }
    }
  }

  private UUID templateId() {
    return jdbc.queryForObject(
        "SELECT id FROM scene_template WHERE code = ?", UUID.class, TEMPLATE_CODE);
  }

  private UUID objectType(String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        WORKSPACE_ID,
        code);
  }

  private UUID relationType(String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        WORKSPACE_ID,
        code);
  }

  private Map<String, Object> fields(Object... values) {
    var fields = new LinkedHashMap<String, Object>();
    for (var index = 0; index < values.length; index += 2) {
      fields.put(String.valueOf(values[index]), values[index + 1]);
    }
    return fields;
  }

  private String body(String text) {
    return "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\""
        + text
        + "\"}]}]}";
  }

  private void ensureBody(UUID objectId, String code, String text) {
    if (objectId == null) return;
    var state = planBodyState(objectId);
    if (state == null || state.hasValue()) return;
    var result =
        commands.updateFields(
            new UpdateFieldsCommand(
                WORKSPACE_ID,
                UUID.randomUUID(),
                key("body-" + code),
                objectId,
                state.version(),
                List.of(new FieldUpdate("body", body(text), null))),
            Actor.user(AUTHOR));
    applyEvents(result);
  }

  private PlanBodyState planBodyState(UUID objectId) {
    var rows =
        jdbc.query(
            """
            SELECT object.version, value.value
            FROM data_object object
            JOIN object_type type ON type.id = object.object_type_id
            LEFT JOIN field_def field ON field.object_type_id = type.id AND field.code = 'body'
            LEFT JOIN data_field_value value ON value.object_id = object.id AND value.field_def_id = field.id
            WHERE object.workspace_id = ? AND object.id = ? AND type.code = 'build_plan'
            """,
            (result, ignored) -> new PlanBodyState(result.getLong(1), result.getObject(2) != null),
            WORKSPACE_ID,
            objectId);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private record PlanBodyState(long version, boolean hasValue) {}

  private UUID required(Map<String, UUID> values, String code) {
    var value = values.get(code);
    if (value == null) {
      throw new IllegalStateException("DEV SEED: missing pc procurement reference " + code);
    }
    return value;
  }

  private String key(String suffix) {
    return "dev-seed-" + TEMPLATE_CODE + "-" + suffix;
  }
}
