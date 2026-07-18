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

  private record ProductSeed(
      String code,
      String name,
      String category,
      Number referencePrice,
      Number performanceScore,
      Number power,
      Number powerSupplyCapacity,
      Number cpuMainboardPlatform,
      Number memoryPlatform) {}

  private record QuoteSeed(
      String code,
      String name,
      Number unitPrice,
      Number inventory,
      Number deliveryDays,
      String productCode,
      String supplierCode) {}

  private record ItemSeed(
      String code, String name, String planCode, String productCode, String quoteCode) {}

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
            + ". For the local development database only, run corepack pnpm dev:down, docker"
            + " compose down, confirm m-next_postgres-data, remove that volume, then run corepack"
            + " pnpm dev:up.");
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
    var requirements = seedRequirements();
    var plans = seedPlans();
    relate(
        "build_plan_satisfies_requirement",
        required(plans, "PLAN-ENTRY"),
        required(requirements, "REQ-DEV-ENTRY"),
        "satisfies-PLAN-ENTRY");
    relate(
        "build_plan_satisfies_requirement",
        required(plans, "PLAN-STD"),
        required(requirements, "REQ-DEV-A"),
        "satisfies-PLAN-STD");
    relate(
        "build_plan_satisfies_requirement",
        required(plans, "PLAN-PRO"),
        required(requirements, "REQ-DEV-A"),
        "satisfies-PLAN-PRO");
    relate(
        "build_plan_satisfies_requirement",
        required(plans, "PLAN-BAD"),
        required(requirements, "REQ-DEV-A"),
        "satisfies-PLAN-BAD");
    var products = seedProducts();
    var suppliers = seedSuppliers();
    var quotes = seedQuotes(products, suppliers);
    seedPlanItems(plans, products, quotes);
  }

  private Map<String, UUID> seedRequirements() {
    var requirements = new LinkedHashMap<String, UUID>();
    requirements.put(
        "REQ-DEV-A",
        createObject(
            "procurement_requirement",
            fields(
                "code", "REQ-DEV-A",
                "name", "开发岗标准配置(A档)",
                "job_role", "前端/Java 开发",
                "quantity", 20,
                "unit_budget_cny", 8000,
                "warranty_requirement", "三年上门",
                "os_requirement", "Windows 11 Pro",
                "max_total_power_w", 650)));
    requirements.put(
        "REQ-DEV-ENTRY",
        createObject(
            "procurement_requirement",
            fields(
                "code", "REQ-DEV-ENTRY",
                "name", "入门开发岗配置",
                "job_role", "初级开发",
                "quantity", 5,
                "unit_budget_cny", 5500,
                "warranty_requirement", "一年送修",
                "os_requirement", "Windows 11 Pro",
                "max_total_power_w", 450)));
    return requirements;
  }

  private Map<String, UUID> seedPlans() {
    var plans = new LinkedHashMap<String, UUID>();
    plans.put("PLAN-ENTRY", createPlan("PLAN-ENTRY", "入门开发配置(约5200元)", "入门开发标准配置说明"));
    plans.put(
        "PLAN-STD",
        createPlan(
            "PLAN-STD",
            "标准开发配置(约8000元)",
            "本方案面向前端/Java 开发岗位，按 20 台标准配置采购，提供三年上门保修并预装 Windows 11 Pro。"));
    plans.put("PLAN-PRO", createPlan("PLAN-PRO", "高级开发配置(约12000元)", "高级开发配置说明"));
    plans.put("PLAN-BAD", createPlan("PLAN-BAD", "平台不兼容反例", "平台兼容与电源余量反例说明"));
    return plans;
  }

  private UUID createPlan(String code, String name, String text) {
    var plan =
        createObject(
            "build_plan",
            fields("code", code, "name", name, "status", "PROPOSED", "body", body(text)));
    ensureBody(plan, code, text);
    return plan;
  }

  private Map<String, UUID> seedProducts() {
    var products = new LinkedHashMap<String, UUID>();
    for (var product : productSeeds()) {
      addProduct(
          products,
          product.code(),
          product.name(),
          product.category(),
          product.referencePrice(),
          product.performanceScore(),
          product.power(),
          product.powerSupplyCapacity(),
          product.cpuMainboardPlatform(),
          product.memoryPlatform());
    }
    return products;
  }

  private List<ProductSeed> productSeeds() {
    return List.of(
        new ProductSeed(
            "HW-CPU-I5-14400", "Intel Core i5-14400", "CPU", 1350, 72, 65, null, 1700, 5),
        new ProductSeed(
            "HW-CPU-ULTRA7-265", "Intel Core Ultra 7 265", "CPU", 1650, 88, 65, null, 1700, 5),
        new ProductSeed("HW-CPU-R9-9900X", "AMD Ryzen 9 9900X", "CPU", 3100, 96, 170, null, 5, 5),
        new ProductSeed("HW-COOLER-AX120", "利民 AX120", "COOLER", 79, 20, 5, null, null, null),
        new ProductSeed("HW-COOLER-PA120", "利民 PA120 SE", "COOLER", 179, 55, 8, null, null, null),
        new ProductSeed("HW-COOLER-FC140", "利民 FC140", "COOLER", 299, 70, 10, null, null, null),
        new ProductSeed("HW-MB-B760M", "B760M 主板", "MAINBOARD", 699, 70, 45, null, 1700, 5),
        new ProductSeed("HW-MB-B860", "B860 主板", "MAINBOARD", 899, 80, 45, null, 1700, 5),
        new ProductSeed("HW-MB-B850", "B850 主板", "MAINBOARD", 999, 85, 50, null, 5, 5),
        new ProductSeed(
            "HW-RAM-32G-DDR5-5600", "32GB DDR5 5600(16×2)", "MEMORY", 599, 72, 10, null, null, 5),
        new ProductSeed(
            "HW-RAM-64G-DDR5-6000", "64GB DDR5 6000(32×2)", "MEMORY", 999, 84, 12, null, null, 5),
        new ProductSeed(
            "HW-RAM-96G-DDR5", "96GB DDR5(48×2)", "MEMORY", 1599, 93, 15, null, null, 5),
        new ProductSeed(
            "HW-SSD-TIPLUS7100-1TB",
            "致态 TiPlus7100 1TB PCIe4.0",
            "STORAGE",
            449,
            78,
            6,
            null,
            null,
            null),
        new ProductSeed(
            "HW-SSD-2TB-PCIE4", "2TB PCIe4.0 固态硬盘", "STORAGE", 699, 84, 7, null, null, null),
        new ProductSeed(
            "HW-SSD-2TB-PCIE5", "2TB PCIe5.0 固态硬盘", "STORAGE", 1099, 92, 9, null, null, null),
        new ProductSeed("HW-GPU-RTX5060", "RTX 5060 8G", "GPU", 1899, 88, 145, null, null, null),
        new ProductSeed("HW-GPU-RTX5070", "RTX 5070 12G", "GPU", 4099, 96, 250, null, null, null),
        new ProductSeed("HW-PSU-550-BRONZE", "550W 铜牌电源", "PSU", 359, 55, 0, 550, null, null),
        new ProductSeed("HW-PSU-450-BRONZE", "450W 铜牌电源", "PSU", 279, 40, 0, 450, null, null),
        new ProductSeed("HW-PSU-650-GOLD", "650W 金牌电源", "PSU", 599, 70, 0, 650, null, null),
        new ProductSeed("HW-PSU-850-GOLD", "850W 金牌电源", "PSU", 899, 85, 0, 850, null, null),
        new ProductSeed("HW-CASE-MATX", "MATX 机箱", "CASE", 249, 45, 0, null, null, null),
        new ProductSeed("HW-CASE-MID", "中塔机箱", "CASE", 399, 60, 0, null, null, null),
        new ProductSeed(
            "HW-MON-27-2K-100", "27 寸 2K IPS 100Hz", "MONITOR", 1299, 60, 30, null, null, null),
        new ProductSeed(
            "HW-MON-27-2K-180", "27 寸 2K IPS 180Hz", "MONITOR", 1499, 70, 35, null, null, null),
        new ProductSeed("HW-MON-32-4K", "32 寸 4K 显示器", "MONITOR", 2199, 80, 50, null, null, null),
        new ProductSeed(
            "HW-PERIPHERAL-OFFICE", "办公键鼠套装", "PERIPHERAL", 189, 30, 5, null, null, null));
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
        "SUP-SOUTH", createObject("supplier", fields("code", "SUP-SOUTH", "name", "华南组件供应商")));
    return suppliers;
  }

  private Map<String, UUID> seedQuotes(Map<String, UUID> products, Map<String, UUID> suppliers) {
    var quotes = new LinkedHashMap<String, UUID>();
    for (var quote : quoteSeeds()) {
      addQuote(
          quotes,
          products,
          suppliers,
          quote.code(),
          quote.name(),
          quote.unitPrice(),
          quote.inventory(),
          quote.deliveryDays(),
          quote.productCode(),
          quote.supplierCode());
    }
    return quotes;
  }

  private List<QuoteSeed> quoteSeeds() {
    return List.of(
        new QuoteSeed(
            "Q-CPU-I5-14400", "华北 i5-14400 报价", 1299, 30, 3, "HW-CPU-I5-14400", "SUP-NORTH"),
        new QuoteSeed(
            "Q-CPU-ULTRA7-265", "华南 Ultra 7 报价", 1499, 25, 5, "HW-CPU-ULTRA7-265", "SUP-SOUTH"),
        new QuoteSeed(
            "Q-CPU-R9-9900X", "华北 Ryzen 9 报价", 2399, 20, 7, "HW-CPU-R9-9900X", "SUP-NORTH"),
        new QuoteSeed("Q-COOLER-AX120", "华南 AX120 报价", 79, 30, 3, "HW-COOLER-AX120", "SUP-SOUTH"),
        new QuoteSeed(
            "Q-COOLER-PA120", "华北 PA120 SE 报价", 159, 25, 3, "HW-COOLER-PA120", "SUP-NORTH"),
        new QuoteSeed("Q-COOLER-FC140", "华南 FC140 报价", 279, 20, 5, "HW-COOLER-FC140", "SUP-SOUTH"),
        new QuoteSeed("Q-MB-B760M", "华北 B760M 报价", 699, 30, 4, "HW-MB-B760M", "SUP-NORTH"),
        new QuoteSeed("Q-MB-B860", "华南 B860 报价", 699, 25, 5, "HW-MB-B860", "SUP-SOUTH"),
        new QuoteSeed("Q-MB-B850", "华北 B850 报价", 949, 20, 6, "HW-MB-B850", "SUP-NORTH"),
        new QuoteSeed("Q-RAM-32G", "华南 32GB 内存报价", 599, 30, 3, "HW-RAM-32G-DDR5-5600", "SUP-SOUTH"),
        new QuoteSeed("Q-RAM-64G", "华北 64GB 内存报价", 799, 25, 4, "HW-RAM-64G-DDR5-6000", "SUP-NORTH"),
        new QuoteSeed("Q-RAM-96G", "华南 96GB 内存报价", 1549, 20, 6, "HW-RAM-96G-DDR5", "SUP-SOUTH"),
        new QuoteSeed(
            "Q-SSD-1TB", "华北 TiPlus7100 1TB 报价", 449, 30, 3, "HW-SSD-TIPLUS7100-1TB", "SUP-NORTH"),
        new QuoteSeed(
            "Q-SSD-2TB-PCIE4", "华南 2TB PCIe4 报价", 569, 25, 4, "HW-SSD-2TB-PCIE4", "SUP-SOUTH"),
        new QuoteSeed(
            "Q-SSD-2TB-PCIE5", "华北 2TB PCIe5 报价", 1049, 20, 5, "HW-SSD-2TB-PCIE5", "SUP-NORTH"),
        new QuoteSeed(
            "Q-GPU-RTX5060", "华南 RTX 5060 报价", 1799, 25, 5, "HW-GPU-RTX5060", "SUP-SOUTH"),
        new QuoteSeed(
            "Q-GPU-RTX5070", "华北 RTX 5070 报价", 3999, 20, 6, "HW-GPU-RTX5070", "SUP-NORTH"),
        new QuoteSeed("Q-PSU-550", "华南 550W 铜牌报价", 359, 25, 3, "HW-PSU-550-BRONZE", "SUP-SOUTH"),
        new QuoteSeed("Q-PSU-450", "华北 450W 铜牌报价", 259, 25, 4, "HW-PSU-450-BRONZE", "SUP-NORTH"),
        new QuoteSeed("Q-PSU-650", "华北 650W 金牌报价", 449, 25, 3, "HW-PSU-650-GOLD", "SUP-NORTH"),
        new QuoteSeed("Q-PSU-850", "华南 850W 金牌报价", 859, 20, 5, "HW-PSU-850-GOLD", "SUP-SOUTH"),
        new QuoteSeed("Q-CASE-MATX", "华北 MATX 机箱报价", 249, 25, 4, "HW-CASE-MATX", "SUP-NORTH"),
        new QuoteSeed("Q-CASE-MID", "华南中塔机箱报价", 299, 25, 4, "HW-CASE-MID", "SUP-SOUTH"),
        new QuoteSeed(
            "Q-MON-27-2K-100", "华北 27 寸 2K 100Hz 报价", 1299, 25, 5, "HW-MON-27-2K-100", "SUP-NORTH"),
        new QuoteSeed(
            "Q-MON-27-2K-180", "华南 27 寸 2K 180Hz 报价", 1499, 25, 5, "HW-MON-27-2K-180", "SUP-SOUTH"),
        new QuoteSeed("Q-MON-32-4K", "华北 32 寸 4K 报价", 2099, 20, 7, "HW-MON-32-4K", "SUP-NORTH"),
        new QuoteSeed(
            "Q-PERIPHERAL-OFFICE", "华南办公键鼠报价", 149, 30, 3, "HW-PERIPHERAL-OFFICE", "SUP-SOUTH"),
        new QuoteSeed(
            "Q-PERIPHERAL-LOW", "华北办公键鼠低库存报价", 139, 0, 4, "HW-PERIPHERAL-OFFICE", "SUP-NORTH"));
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
    seedItems(plans, products, quotes, entryItems());
    seedItems(plans, products, quotes, standardItems());
    seedItems(plans, products, quotes, proItems());
    seedItems(plans, products, quotes, badItems());
  }

  private void seedItems(
      Map<String, UUID> plans,
      Map<String, UUID> products,
      Map<String, UUID> quotes,
      List<ItemSeed> items) {
    for (var item : items) {
      addItem(
          plans,
          products,
          quotes,
          item.code(),
          item.name(),
          1,
          item.planCode(),
          item.productCode(),
          item.quoteCode());
    }
  }

  private List<ItemSeed> entryItems() {
    return List.of(
        new ItemSeed(
            "ITEM-ENTRY-CPU", "入门配置 CPU", "PLAN-ENTRY", "HW-CPU-I5-14400", "Q-CPU-I5-14400"),
        new ItemSeed(
            "ITEM-ENTRY-COOLER", "入门配置散热器", "PLAN-ENTRY", "HW-COOLER-AX120", "Q-COOLER-AX120"),
        new ItemSeed("ITEM-ENTRY-MB", "入门配置主板", "PLAN-ENTRY", "HW-MB-B760M", "Q-MB-B760M"),
        new ItemSeed("ITEM-ENTRY-RAM", "入门配置内存", "PLAN-ENTRY", "HW-RAM-32G-DDR5-5600", "Q-RAM-32G"),
        new ItemSeed(
            "ITEM-ENTRY-SSD", "入门配置存储", "PLAN-ENTRY", "HW-SSD-TIPLUS7100-1TB", "Q-SSD-1TB"),
        new ItemSeed("ITEM-ENTRY-PSU", "入门配置电源", "PLAN-ENTRY", "HW-PSU-550-BRONZE", "Q-PSU-550"),
        new ItemSeed("ITEM-ENTRY-CASE", "入门配置机箱", "PLAN-ENTRY", "HW-CASE-MATX", "Q-CASE-MATX"),
        new ItemSeed(
            "ITEM-ENTRY-MON", "入门配置显示器", "PLAN-ENTRY", "HW-MON-27-2K-100", "Q-MON-27-2K-100"),
        new ItemSeed(
            "ITEM-ENTRY-PERIPHERAL",
            "入门配置键鼠",
            "PLAN-ENTRY",
            "HW-PERIPHERAL-OFFICE",
            "Q-PERIPHERAL-OFFICE"));
  }

  private List<ItemSeed> standardItems() {
    return List.of(
        new ItemSeed(
            "ITEM-STD-CPU", "标准配置 CPU", "PLAN-STD", "HW-CPU-ULTRA7-265", "Q-CPU-ULTRA7-265"),
        new ItemSeed("ITEM-STD-COOLER", "标准配置散热器", "PLAN-STD", "HW-COOLER-PA120", "Q-COOLER-PA120"),
        new ItemSeed("ITEM-STD-MB", "标准配置主板", "PLAN-STD", "HW-MB-B860", "Q-MB-B860"),
        new ItemSeed("ITEM-STD-RAM", "标准配置内存", "PLAN-STD", "HW-RAM-64G-DDR5-6000", "Q-RAM-64G"),
        new ItemSeed("ITEM-STD-SSD", "标准配置存储", "PLAN-STD", "HW-SSD-2TB-PCIE4", "Q-SSD-2TB-PCIE4"),
        new ItemSeed("ITEM-STD-GPU", "标准配置显卡", "PLAN-STD", "HW-GPU-RTX5060", "Q-GPU-RTX5060"),
        new ItemSeed("ITEM-STD-PSU", "标准配置电源", "PLAN-STD", "HW-PSU-650-GOLD", "Q-PSU-650"),
        new ItemSeed("ITEM-STD-CASE", "标准配置机箱", "PLAN-STD", "HW-CASE-MID", "Q-CASE-MID"),
        new ItemSeed("ITEM-STD-MON", "标准配置显示器", "PLAN-STD", "HW-MON-27-2K-180", "Q-MON-27-2K-180"),
        new ItemSeed(
            "ITEM-STD-PERIPHERAL",
            "标准配置键鼠",
            "PLAN-STD",
            "HW-PERIPHERAL-OFFICE",
            "Q-PERIPHERAL-OFFICE"));
  }

  private List<ItemSeed> proItems() {
    return List.of(
        new ItemSeed("ITEM-PRO-CPU", "高级配置 CPU", "PLAN-PRO", "HW-CPU-R9-9900X", "Q-CPU-R9-9900X"),
        new ItemSeed("ITEM-PRO-COOLER", "高级配置散热器", "PLAN-PRO", "HW-COOLER-FC140", "Q-COOLER-FC140"),
        new ItemSeed("ITEM-PRO-MB", "高级配置主板", "PLAN-PRO", "HW-MB-B850", "Q-MB-B850"),
        new ItemSeed("ITEM-PRO-RAM", "高级配置内存", "PLAN-PRO", "HW-RAM-96G-DDR5", "Q-RAM-96G"),
        new ItemSeed("ITEM-PRO-SSD", "高级配置存储", "PLAN-PRO", "HW-SSD-2TB-PCIE5", "Q-SSD-2TB-PCIE5"),
        new ItemSeed("ITEM-PRO-GPU", "高级配置显卡", "PLAN-PRO", "HW-GPU-RTX5070", "Q-GPU-RTX5070"),
        new ItemSeed("ITEM-PRO-PSU", "高级配置电源", "PLAN-PRO", "HW-PSU-850-GOLD", "Q-PSU-850"),
        new ItemSeed("ITEM-PRO-CASE", "高级配置机箱", "PLAN-PRO", "HW-CASE-MID", "Q-CASE-MID"),
        new ItemSeed("ITEM-PRO-MON", "高级配置显示器", "PLAN-PRO", "HW-MON-32-4K", "Q-MON-32-4K"),
        new ItemSeed(
            "ITEM-PRO-PERIPHERAL",
            "高级配置键鼠",
            "PLAN-PRO",
            "HW-PERIPHERAL-OFFICE",
            "Q-PERIPHERAL-LOW"));
  }

  private List<ItemSeed> badItems() {
    return List.of(
        new ItemSeed("ITEM-BAD-CPU", "反例 CPU", "PLAN-BAD", "HW-CPU-R9-9900X", "Q-CPU-R9-9900X"),
        new ItemSeed("ITEM-BAD-COOLER", "反例散热器", "PLAN-BAD", "HW-COOLER-AX120", "Q-COOLER-AX120"),
        new ItemSeed("ITEM-BAD-MB", "反例主板", "PLAN-BAD", "HW-MB-B760M", "Q-MB-B760M"),
        new ItemSeed("ITEM-BAD-RAM", "反例内存", "PLAN-BAD", "HW-RAM-32G-DDR5-5600", "Q-RAM-32G"),
        new ItemSeed("ITEM-BAD-SSD", "反例存储", "PLAN-BAD", "HW-SSD-TIPLUS7100-1TB", "Q-SSD-1TB"),
        new ItemSeed("ITEM-BAD-GPU", "反例显卡", "PLAN-BAD", "HW-GPU-RTX5060", "Q-GPU-RTX5060"),
        new ItemSeed("ITEM-BAD-PSU", "反例低容量电源", "PLAN-BAD", "HW-PSU-450-BRONZE", "Q-PSU-450"),
        new ItemSeed("ITEM-BAD-CASE", "反例机箱", "PLAN-BAD", "HW-CASE-MATX", "Q-CASE-MATX"),
        new ItemSeed("ITEM-BAD-MON", "反例显示器", "PLAN-BAD", "HW-MON-27-2K-100", "Q-MON-27-2K-100"),
        new ItemSeed(
            "ITEM-BAD-PERIPHERAL",
            "反例键鼠",
            "PLAN-BAD",
            "HW-PERIPHERAL-OFFICE",
            "Q-PERIPHERAL-OFFICE"));
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
