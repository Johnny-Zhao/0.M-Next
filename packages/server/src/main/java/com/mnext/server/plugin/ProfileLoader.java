package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.rules.ExpressionTypeChecker;
import com.mnext.engines.rules.OclParser;
import com.mnext.engines.rules.RuleSyntaxException;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.metamodel.CreateTemplateCommand;
import com.mnext.kernel.api.metamodel.CreateTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.DefineValueTypeCommand;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import com.mnext.kernel.api.metamodel.PublishTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.RestoreTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.WithdrawTemplateVersionCommand;
import com.mnext.server.plugin.ProfileManifest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class ProfileLoader {
  static final UUID AUTHOR_WORKSPACE = UUID.fromString("a0000000-0000-4000-8000-000000000000");
  private static final Set<String> SEVERITIES = Set.of("BLOCK", "WARN", "INFO");

  private final MetaCommandService commands;
  private final DerivedFieldRepository derivedFields;
  private final RuleDefRepository rules;
  private final DataCatalogRepository catalogs;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  ProfileLoader(
      MetaCommandService commands,
      DerivedFieldRepository derivedFields,
      RuleDefRepository rules,
      DataCatalogRepository catalogs,
      JdbcTemplate jdbc,
      ObjectMapper mapper) {
    this.commands = commands;
    this.derivedFields = derivedFields;
    this.rules = rules;
    this.catalogs = catalogs;
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Transactional
  public void install(ProfileManifest manifest, Actor actor) {
    validate(manifest);
    ensureAuthorWorkspace();
    var existing = latestTemplateVersion(manifest.templateCode());
    if (existing != null) {
      if ("published".equals(existing.status())) {
        if (templateNeedsUpgrade(manifest, existing)) {
          upgradeTemplateVersion(manifest, existing, actor);
          return;
        }
        defineMissingFields(manifest, existing, actor);
        syncCatalogLayout(manifest, existing.versionId(), actor);
        return;
      }
      if ("withdrawn".equals(existing.status())) {
        commands.restoreTemplateVersion(
            new RestoreTemplateVersionCommand(
                AUTHOR_WORKSPACE, correlation(), key(manifest, "restore"), existing.versionId()),
            actor);
        if (templateNeedsUpgrade(manifest, existing)) {
          upgradeTemplateVersion(manifest, existing, actor);
          return;
        }
        defineMissingFields(manifest, existing, actor);
        syncCatalogLayout(manifest, existing.versionId(), actor);
        return;
      }
      throw schema("templateCode 已存在未发布版本，无法装载 profile: " + manifest.templateCode());
    }

    var created =
        commands.createTemplate(
            new CreateTemplateCommand(
                AUTHOR_WORKSPACE,
                correlation(),
                key(manifest, "create-template"),
                manifest.templateCode(),
                manifest.name()),
            actor);
    var versionId = detailUuid(created, "templateVersionId");
    updateTemplateMetadata(manifest, versionId);
    defineValueTypes(manifest, versionId, actor);
    var objectTypeIds = defineObjectTypes(manifest, versionId, actor);
    defineFields(manifest, objectTypeIds, actor);
    defineRelations(manifest, versionId, objectTypeIds, actor);
    defineDerivedFields(manifest, versionId, objectTypeIds, actor);
    defineRules(manifest, versionId, actor);
    commands.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            AUTHOR_WORKSPACE, correlation(), key(manifest, "publish-template"), versionId),
        actor);
    syncCatalogLayout(manifest, versionId, actor);
  }

  private boolean templateNeedsUpgrade(ProfileManifest manifest, TemplateVersion version) {
    var installedProfileVersion = profileVersion(version.versionId());
    if (installedProfileVersion != null
        && compareVersions(manifest.version(), installedProfileVersion) > 0) {
      return true;
    }
    for (var derived : manifest.derivedOrEmpty()) {
      if (!templateDerivedExists(version.versionId(), derived.objectType(), derived.code())) {
        return true;
      }
    }
    for (var rule : manifest.rulesOrEmpty()) {
      if (!templateRuleExists(version.versionId(), rule.code())) return true;
    }
    return false;
  }

  private String profileVersion(UUID versionId) {
    return jdbc.query(
        "SELECT tags ->> 'profileVersion' FROM scene_template_version WHERE id = ?",
        result -> result.next() ? result.getString(1) : null,
        versionId);
  }

  private int compareVersions(String left, String right) {
    var leftParts = versionParts(left);
    var rightParts = versionParts(right);
    for (var index = 0; index < 3; index++) {
      var comparison = Integer.compare(leftParts[index], rightParts[index]);
      if (comparison != 0) return comparison;
    }
    return 0;
  }

  private int[] versionParts(String value) {
    var parts = value == null ? new String[0] : value.split("\\.");
    var result = new int[3];
    for (var index = 0; index < Math.min(parts.length, result.length); index++) {
      try {
        result[index] = Integer.parseInt(parts[index]);
      } catch (NumberFormatException ignored) {
        throw schema("profile version 格式无效: " + value);
      }
    }
    return result;
  }

  private void upgradeTemplateVersion(
      ProfileManifest manifest, TemplateVersion source, Actor actor) {
    var created =
        commands.createTemplateVersion(
            new CreateTemplateVersionCommand(
                AUTHOR_WORKSPACE,
                correlation(),
                key(manifest, "upgrade", Integer.toString(source.version())),
                source.templateId()),
            actor);
    var versionId = detailUuid(created, "templateVersionId");
    updateTemplateMetadata(manifest, versionId);
    cloneTemplateDefinitions(source.versionId(), versionId, actor);
    defineMissingFields(
        manifest,
        new TemplateVersion(source.templateId(), versionId, source.version() + 1, "draft"),
        actor);
    defineMissingDerivedFields(manifest, versionId, actor);
    defineMissingRules(manifest, versionId, actor);
    commands.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            AUTHOR_WORKSPACE,
            correlation(),
            key(manifest, "upgrade-publish", Integer.toString(source.version())),
            versionId),
        actor);
    syncCatalogLayout(manifest, versionId, actor);
  }

  private void syncCatalogLayout(ProfileManifest manifest, UUID versionId, Actor actor) {
    catalogs.syncTemplateLayout(versionId, manifest);
    catalogs.syncInstalledWorkspaces(versionId, actor.id());
  }

  private void cloneTemplateDefinitions(UUID sourceVersionId, UUID targetVersionId, Actor actor) {
    var pendingValues = new ArrayList<>(templateValueTypes(sourceVersionId));
    var copiedValueCodes = new HashSet<String>();
    while (!pendingValues.isEmpty()) {
      var copiedAny = false;
      for (var iterator = pendingValues.iterator(); iterator.hasNext(); ) {
        var value = iterator.next();
        if (value.parentCode() != null && !copiedValueCodes.contains(value.parentCode())) continue;
        commands.defineValueType(
            new DefineValueTypeCommand(
                AUTHOR_WORKSPACE,
                correlation(),
                "profile-clone-value:" + targetVersionId + ":" + value.code(),
                targetVersionId,
                value.code(),
                value.name(),
                DataType.fromCode(value.basePrimitive()),
                value.parentCode(),
                constraints(parseJson(value.constraintsJson()))),
            actor);
        copiedValueCodes.add(value.code());
        iterator.remove();
        copiedAny = true;
      }
      if (!copiedAny) throw schema("profile template value type hierarchy is invalid");
    }
    var objectTypes = new LinkedHashMap<String, UUID>();
    var pendingObjectTypes = new ArrayList<>(templateObjectTypes(sourceVersionId));
    while (!pendingObjectTypes.isEmpty()) {
      var copiedAny = false;
      for (var iterator = pendingObjectTypes.iterator(); iterator.hasNext(); ) {
        var type = iterator.next();
        if (type.parentCode() != null && !objectTypes.containsKey(type.parentCode())) continue;
        commands.defineObjectType(
            new DefineObjectTypeCommand(
                AUTHOR_WORKSPACE,
                correlation(),
                "profile-clone-object:" + targetVersionId + ":" + type.code(),
                targetVersionId,
                type.code(),
                type.name(),
                type.parentCode()),
            actor);
        objectTypes.put(type.code(), objectTypeId(targetVersionId, type.code()));
        iterator.remove();
        copiedAny = true;
      }
      if (!copiedAny) throw schema("profile template object type hierarchy is invalid");
    }
    for (var field : templateFields(sourceVersionId)) {
      commands.defineFieldDef(
          new DefineFieldDefCommand(
              AUTHOR_WORKSPACE,
              correlation(),
              "profile-clone-field:"
                  + targetVersionId
                  + ":"
                  + field.objectTypeCode()
                  + "."
                  + field.code(),
              objectTypes.get(field.objectTypeCode()),
              field.code(),
              field.name(),
              field.valueTypeCode() == null
                  ? (field.dataType() == null ? null : DataType.fromCode(field.dataType()))
                  : null,
              field.valueTypeCode(),
              field.required(),
              field.uniqueValue(),
              field.redefinesFieldCode(),
              constraints(parseJson(field.constraintsJson()))),
          actor);
    }
    for (var relation : templateRelations(sourceVersionId)) {
      commands.defineRelationType(
          new DefineRelationTypeCommand(
              AUTHOR_WORKSPACE,
              correlation(),
              "profile-clone-relation:" + targetVersionId + ":" + relation.code(),
              relation.code(),
              relation.name(),
              objectTypes.get(relation.sourceCode()),
              objectTypes.get(relation.targetCode()),
              relation.direction(),
              relation.cardinality(),
              relation.semantics(),
              relation.hierarchical(),
              targetVersionId,
              relation.kind()),
          actor);
    }
    for (var derived : templateDerivedFields(sourceVersionId)) {
      derivedFields.define(
          new DefineDerivedFieldRequest(
              AUTHOR_WORKSPACE,
              correlation(),
              "profile-clone-derived:"
                  + targetVersionId
                  + ":"
                  + derived.objectTypeCode()
                  + "."
                  + derived.code(),
              targetVersionId,
              objectTypes.get(derived.objectTypeCode()),
              derived.code(),
              derived.name(),
              derived.resultType(),
              derived.derivation()),
          actor.id());
    }
    for (var rule : templateRules(sourceVersionId)) {
      rules.defineTemplateRule(
          new DefineRuleRequest(
              AUTHOR_WORKSPACE,
              correlation(),
              "profile-clone-rule:" + targetVersionId + ":" + rule.code(),
              targetVersionId,
              rule.code(),
              new RuleScopeRequest(rule.objectTypeCode(), rule.fieldCode()),
              rule.severity(),
              rule.whenSrc(),
              rule.message(),
              parseJson(rule.impactJson()),
              rule.suggest(),
              parseJson(rule.fixJson()),
              rule.lightweight()),
          actor.id());
      rules.publishTemplateRule(AUTHOR_WORKSPACE, targetVersionId, rule.code(), actor.id());
    }
  }

  private void defineMissingDerivedFields(ProfileManifest manifest, UUID versionId, Actor actor) {
    var objectTypeIds = objectTypeIds(new TemplateVersion(null, versionId, 0, "draft"));
    for (var derived : manifest.derivedOrEmpty()) {
      if (templateDerivedExists(versionId, derived.objectType(), derived.code())) continue;
      derivedFields.define(
          new DefineDerivedFieldRequest(
              AUTHOR_WORKSPACE,
              correlation(),
              key(manifest, "upgrade-derived", derived.objectType(), derived.code()),
              versionId,
              objectTypeIds.get(derived.objectType()),
              derived.code(),
              derived.name(),
              derived.resultType(),
              ExpressionLanguageSupport.encode(derived.derivation(), derived.lang())),
          actor.id());
    }
  }

  private void defineMissingRules(ProfileManifest manifest, UUID versionId, Actor actor) {
    for (var rule : manifest.rulesOrEmpty()) {
      if (templateRuleExists(versionId, rule.code())) continue;
      rules.defineTemplateRule(
          new DefineRuleRequest(
              AUTHOR_WORKSPACE,
              correlation(),
              key(manifest, "upgrade-rule", rule.code()),
              versionId,
              rule.code(),
              new RuleScopeRequest(rule.objectType(), rule.field()),
              rule.severity(),
              ExpressionLanguageSupport.encode(rule.when(), rule.lang()),
              rule.message(),
              rule.impact(),
              rule.suggest(),
              rule.fix(),
              Boolean.TRUE.equals(rule.lightweight())),
          actor.id());
      rules.publishTemplateRule(AUTHOR_WORKSPACE, versionId, rule.code(), actor.id());
    }
  }

  private boolean templateDerivedExists(UUID versionId, String objectTypeCode, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS(
              SELECT 1 FROM derived_field derived
              JOIN object_type type ON type.id = derived.object_type_id
              WHERE derived.template_version_id = ? AND type.code = ? AND derived.code = ?)
            """,
            Boolean.class,
            versionId,
            objectTypeCode,
            code));
  }

  private boolean templateRuleExists(UUID versionId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM rule_def WHERE template_version_id = ? AND rule_code = ?)",
            Boolean.class,
            versionId,
            code));
  }

  private List<TemplateValue> templateValueTypes(UUID versionId) {
    return jdbc.query(
        """
        SELECT value.code, value.name, value.base_primitive, parent.code AS parent_code,
               value.constraints::text AS constraints_json
        FROM value_type value
        LEFT JOIN value_type parent ON parent.id = value.parent_value_type_id
        WHERE value.template_version_id = ? ORDER BY value.code
        """,
        (row, ignored) ->
            new TemplateValue(
                row.getString("code"),
                row.getString("name"),
                row.getString("base_primitive"),
                row.getString("parent_code"),
                row.getString("constraints_json")),
        versionId);
  }

  private List<TemplateObject> templateObjectTypes(UUID versionId) {
    return jdbc.query(
        """
        SELECT type.code, type.name, parent.code AS parent_code
        FROM object_type type
        LEFT JOIN object_type parent ON parent.id = type.parent_type_id
        WHERE type.template_version_id = ? ORDER BY type.code
        """,
        (row, ignored) ->
            new TemplateObject(
                row.getString("code"), row.getString("name"), row.getString("parent_code")),
        versionId);
  }

  private List<TemplateField> templateFields(UUID versionId) {
    return jdbc.query(
        """
        SELECT type.code AS object_type_code, field.code, field.name, field.data_type,
               value.code AS value_type_code, field.required, field.unique_value,
               redefined.code AS redefines_field_code, field.constraints::text AS constraints_json
        FROM field_def field
        JOIN object_type type ON type.id = field.object_type_id
        LEFT JOIN value_type value ON value.id = field.value_type_id
        LEFT JOIN field_def redefined ON redefined.id = field.redefines_field_def_id
        WHERE field.template_version_id = ? ORDER BY type.code, field.code
        """,
        (row, ignored) ->
            new TemplateField(
                row.getString("object_type_code"),
                row.getString("code"),
                row.getString("name"),
                row.getString("data_type"),
                row.getString("value_type_code"),
                row.getBoolean("required"),
                row.getBoolean("unique_value"),
                row.getString("redefines_field_code"),
                row.getString("constraints_json")),
        versionId);
  }

  private List<TemplateRelation> templateRelations(UUID versionId) {
    return jdbc.query(
        """
        SELECT relation.code, source.code AS source_code, target.code AS target_code,
               relation.direction, relation.cardinality, relation.semantics, relation.hierarchical,
               relation.kind
        FROM relation_type relation
        JOIN object_type source ON source.id = relation.source_type
        JOIN object_type target ON target.id = relation.target_type
        WHERE relation.template_version_id = ? ORDER BY relation.code
        """,
        (row, ignored) ->
            new TemplateRelation(
                row.getString("code"),
                row.getString("code"),
                row.getString("source_code"),
                row.getString("target_code"),
                row.getString("direction"),
                row.getString("cardinality"),
                row.getString("semantics"),
                row.getBoolean("hierarchical"),
                row.getString("kind")),
        versionId);
  }

  private List<TemplateDerived> templateDerivedFields(UUID versionId) {
    return jdbc.query(
        """
        SELECT type.code AS object_type_code, derived.code, derived.name, derived.result_type,
               derived.derivation
        FROM derived_field derived
        JOIN object_type type ON type.id = derived.object_type_id
        WHERE derived.template_version_id = ? ORDER BY type.code, derived.code
        """,
        (row, ignored) ->
            new TemplateDerived(
                row.getString("object_type_code"),
                row.getString("code"),
                row.getString("name"),
                row.getString("result_type"),
                row.getString("derivation")),
        versionId);
  }

  private List<TemplateRule> templateRules(UUID versionId) {
    return jdbc.query(
        """
        SELECT rule.rule_code, type.code AS object_type_code, field.code AS field_code,
               rule.severity, rule.when_src, rule.message, rule.impact::text AS impact_json,
               rule.suggest, rule.fix::text AS fix_json, rule.lightweight
        FROM rule_def rule
        JOIN object_type type ON type.id = rule.scope_object_type_id
        LEFT JOIN field_def field ON field.id = rule.scope_field_def_id
        WHERE rule.template_version_id = ? ORDER BY rule.rule_code
        """,
        (row, ignored) ->
            new TemplateRule(
                row.getString("rule_code"),
                row.getString("object_type_code"),
                row.getString("field_code"),
                row.getString("severity"),
                row.getString("when_src"),
                row.getString("message"),
                row.getString("impact_json"),
                row.getString("suggest"),
                row.getString("fix_json"),
                row.getBoolean("lightweight")),
        versionId);
  }

  private JsonNode parseJson(String value) {
    if (value == null) return null;
    try {
      return mapper.readTree(value);
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw schema("profile template JSON 鏃犳硶瑙ｆ瀽");
    }
  }

  private record TemplateValue(
      String code, String name, String basePrimitive, String parentCode, String constraintsJson) {}

  private record TemplateObject(String code, String name, String parentCode) {}

  private record TemplateField(
      String objectTypeCode,
      String code,
      String name,
      String dataType,
      String valueTypeCode,
      boolean required,
      boolean uniqueValue,
      String redefinesFieldCode,
      String constraintsJson) {}

  private record TemplateRelation(
      String code,
      String name,
      String sourceCode,
      String targetCode,
      String direction,
      String cardinality,
      String semantics,
      boolean hierarchical,
      String kind) {}

  private record TemplateDerived(
      String objectTypeCode, String code, String name, String resultType, String derivation) {}

  private record TemplateRule(
      String code,
      String objectTypeCode,
      String fieldCode,
      String severity,
      String whenSrc,
      String message,
      String impactJson,
      String suggest,
      String fixJson,
      boolean lightweight) {}

  @Transactional
  public void uninstall(String templateCode, Actor actor) {
    ensureAuthorWorkspace();
    var published = publishedTemplateVersion(templateCode);
    if (published == null) {
      return;
    }
    commands.withdrawTemplateVersion(
        new WithdrawTemplateVersionCommand(
            AUTHOR_WORKSPACE, correlation(), key(templateCode, "withdraw"), published.versionId()),
        actor);
  }

  private void defineValueTypes(ProfileManifest manifest, UUID versionId, Actor actor) {
    for (var valueType : manifest.valueTypesOrEmpty()) {
      commands.defineValueType(
          new DefineValueTypeCommand(
              AUTHOR_WORKSPACE,
              correlation(),
              key(manifest, "value-type", valueType.code()),
              versionId,
              valueType.code(),
              valueType.name(),
              DataType.fromCode(valueType.basePrimitive()),
              valueType.parentValueTypeCode(),
              constraints(valueType.constraints())),
          actor);
    }
  }

  private Map<String, UUID> defineObjectTypes(
      ProfileManifest manifest, UUID versionId, Actor actor) {
    var ids = new LinkedHashMap<String, UUID>();
    var pending = new ArrayList<>(manifest.objectTypesOrEmpty());
    while (!pending.isEmpty()) {
      var progressed = false;
      var iterator = pending.iterator();
      while (iterator.hasNext()) {
        var objectType = iterator.next();
        var parent = objectType.parentTypeCode();
        if (parent != null && !parent.isBlank() && !ids.containsKey(parent)) {
          continue;
        }
        commands.defineObjectType(
            new DefineObjectTypeCommand(
                AUTHOR_WORKSPACE,
                correlation(),
                key(manifest, "object-type", objectType.code()),
                versionId,
                objectType.code(),
                objectType.name(),
                parent),
            actor);
        ids.put(objectType.code(), objectTypeId(versionId, objectType.code()));
        iterator.remove();
        progressed = true;
      }
      if (!progressed) {
        throw schema("objectTypes parentTypeCode 存在循环或缺失父类型");
      }
    }
    return ids;
  }

  private void defineFields(
      ProfileManifest manifest, Map<String, UUID> objectTypeIds, Actor actor) {
    for (var field : manifest.fieldsOrEmpty()) {
      var dataType =
          field.dataType() == null || field.dataType().isBlank()
              ? null
              : DataType.fromCode(field.dataType());
      commands.defineFieldDef(
          new DefineFieldDefCommand(
              AUTHOR_WORKSPACE,
              correlation(),
              key(manifest, "field", field.objectType(), field.code()),
              objectTypeIds.get(field.objectType()),
              field.code(),
              field.name(),
              dataType,
              field.valueTypeCode(),
              Boolean.TRUE.equals(field.required()),
              Boolean.TRUE.equals(field.unique()),
              null,
              constraints(field.constraints())),
          actor);
    }
  }

  private void defineMissingFields(ProfileManifest manifest, TemplateVersion version, Actor actor) {
    var objectTypeIds = objectTypeIds(version);
    for (var field : manifest.fieldsOrEmpty()) {
      var objectTypeId = objectTypeIds.get(field.objectType());
      if (objectTypeId == null) {
        throw schema("fields.objectType 已安装模板中不存在: " + field.objectType());
      }
      if (fieldExists(objectTypeId, field.code())) {
        syncUniqueValue(version, field.objectType(), field.code(), field.unique(), actor);
        continue;
      }
      var type = fieldType(version.versionId(), field);
      insertFieldDef(version.versionId(), objectTypeId, field, type, actor);
    }
  }

  private boolean fieldExists(UUID objectTypeId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM field_def WHERE object_type_id = ? AND code = ?)",
            Boolean.class,
            objectTypeId,
            code));
  }

  private void syncUniqueValue(
      TemplateVersion version, String objectTypeCode, String code, Boolean unique, Actor actor) {
    if (!Boolean.TRUE.equals(unique)) return;
    jdbc.update(
        """
        UPDATE field_def field
        SET unique_value = TRUE, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        FROM object_type type
        JOIN workspace workspace ON workspace.id = type.workspace_id
        WHERE field.object_type_id = type.id
          AND type.code = ?
          AND field.code = ?
          AND (type.template_version_id = ?
            OR (type.template_version_id IS NULL AND workspace.template_id = ?))
        """,
        actor.id(),
        objectTypeCode,
        code,
        version.versionId(),
        version.templateId());
  }

  private FieldType fieldType(UUID versionId, ProfileManifest.Field field) {
    if (!blank(field.dataType())) return new FieldType(DataType.fromCode(field.dataType()), null);
    var rows =
        jdbc.query(
            """
            SELECT id, base_primitive
            FROM value_type
            WHERE workspace_id = ?
              AND code = ?
              AND (template_version_id = ? OR template_version_id IS NULL)
            ORDER BY CASE WHEN template_version_id = ? THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (row, index) ->
                new FieldType(
                    DataType.fromCode(row.getString("base_primitive")),
                    row.getObject("id", UUID.class)),
            AUTHOR_WORKSPACE,
            field.valueTypeCode(),
            versionId,
            versionId);
    if (rows.isEmpty()) throw schema("fields.valueTypeCode 引用不存在: " + field.valueTypeCode());
    return rows.getFirst();
  }

  private void insertFieldDef(
      UUID versionId, UUID objectTypeId, ProfileManifest.Field field, FieldType type, Actor actor) {
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, template_version_id, code, name, required, unique_value, data_type,
           value_type_id, constraints, redefines_field_def_id, created_by, updated_by,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, NULL, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        UUID.randomUUID(),
        objectTypeId,
        versionId,
        field.code(),
        field.name(),
        Boolean.TRUE.equals(field.required()),
        Boolean.TRUE.equals(field.unique()),
        type.dataType().code(),
        type.valueTypeId(),
        constraintsJson(field.constraints()),
        actor.id(),
        actor.id());
  }

  private void defineRelations(
      ProfileManifest manifest, UUID versionId, Map<String, UUID> objectTypeIds, Actor actor) {
    var mapping = "mapping".equals(profileKind(manifest));
    var sourceObjectTypeIds =
        mapping ? objectTypeIds(publishedTemplateVersion(manifest.sourceProfile())) : objectTypeIds;
    var targetObjectTypeIds =
        mapping ? objectTypeIds(publishedTemplateVersion(manifest.targetProfile())) : objectTypeIds;
    for (var relation : manifest.relationsOrEmpty()) {
      commands.defineRelationType(
          new DefineRelationTypeCommand(
              AUTHOR_WORKSPACE,
              correlation(),
              key(manifest, "relation", relation.code()),
              relation.code(),
              relation.name(),
              sourceObjectTypeIds.get(relation.source()),
              targetObjectTypeIds.get(relation.target()),
              relation.direction(),
              relation.cardinality(),
              relation.semantics(),
              Boolean.TRUE.equals(relation.hierarchical()),
              versionId,
              relationKind(manifest, relation)),
          actor);
    }
  }

  private void defineDerivedFields(
      ProfileManifest manifest, UUID versionId, Map<String, UUID> objectTypeIds, Actor actor) {
    for (var derived : manifest.derivedOrEmpty()) {
      derivedFields.define(
          new DefineDerivedFieldRequest(
              AUTHOR_WORKSPACE,
              correlation(),
              key(manifest, "derived", derived.objectType(), derived.code()),
              versionId,
              objectTypeIds.get(derived.objectType()),
              derived.code(),
              derived.name(),
              derived.resultType(),
              ExpressionLanguageSupport.encode(derived.derivation(), derived.lang())),
          actor.id());
    }
  }

  private void defineRules(ProfileManifest manifest, UUID versionId, Actor actor) {
    for (var rule : manifest.rulesOrEmpty()) {
      rules.defineRule(
          new DefineRuleRequest(
              AUTHOR_WORKSPACE,
              correlation(),
              key(manifest, "rule", rule.code()),
              versionId,
              rule.code(),
              new RuleScopeRequest(rule.objectType(), rule.field()),
              rule.severity(),
              ExpressionLanguageSupport.encode(rule.when(), rule.lang()),
              rule.message(),
              rule.impact(),
              rule.suggest(),
              rule.fix(),
              Boolean.TRUE.equals(rule.lightweight())),
          actor.id());
      rules.publishRule(
          new PublishRuleRequest(
              AUTHOR_WORKSPACE,
              correlation(),
              key(manifest, "publish-rule", rule.code()),
              rule.code()),
          actor.id());
    }
  }

  private void validate(ProfileManifest manifest) {
    if (manifest == null
        || blank(manifest.id())
        || blank(manifest.name())
        || blank(manifest.version())
        || blank(manifest.templateCode())) {
      throw schema("profile manifest 的 id/name/version/templateCode 必填");
    }
    if (!Set.of("domain", "mapping").contains(profileKind(manifest))) {
      throw schema("profile kind 只能为 domain 或 mapping");
    }
    if ("mapping".equals(profileKind(manifest))
        && (blank(manifest.sourceProfile()) || blank(manifest.targetProfile()))) {
      throw schema("mapping profile 必须声明 sourceProfile 与 targetProfile");
    }
    unique(
        manifest.valueTypesOrEmpty().stream().map(ProfileManifest.ValueType::code).toList(),
        "valueTypes.code");
    unique(
        manifest.objectTypesOrEmpty().stream().map(ProfileManifest.ObjectType::code).toList(),
        "objectTypes.code");
    unique(
        manifest.relationsOrEmpty().stream().map(ProfileManifest.Relation::code).toList(),
        "relations.code");
    unique(manifest.rulesOrEmpty().stream().map(ProfileManifest.Rule::code).toList(), "rules.code");

    var valueTypeCodes = new HashSet<String>();
    manifest.valueTypesOrEmpty().forEach(valueType -> valueTypeCodes.add(valueType.code()));
    var objectTypeCodes = new HashSet<String>();
    manifest.objectTypesOrEmpty().forEach(objectType -> objectTypeCodes.add(objectType.code()));
    validateCatalog(manifest, objectTypeCodes);
    var fields = new HashSet<String>();
    for (var objectType : manifest.objectTypesOrEmpty()) {
      if (!blank(objectType.parentTypeCode())
          && !objectTypeCodes.contains(objectType.parentTypeCode())) {
        throw schema("objectTypes.parentTypeCode 引用不存在: " + objectType.parentTypeCode());
      }
    }
    for (var valueType : manifest.valueTypesOrEmpty()) {
      if (!blank(valueType.parentValueTypeCode())
          && !valueTypeCodes.contains(valueType.parentValueTypeCode())) {
        throw schema("valueTypes.parentValueTypeCode 引用不存在: " + valueType.parentValueTypeCode());
      }
    }
    for (var field : manifest.fieldsOrEmpty()) {
      requireObjectType(objectTypeCodes, field.objectType(), "fields.objectType");
      if (!blank(field.valueTypeCode()) && !valueTypeCodes.contains(field.valueTypeCode())) {
        throw schema("fields.valueTypeCode 引用不存在: " + field.valueTypeCode());
      }
      if (!fields.add(field.objectType() + "." + field.code())) {
        throw schema("fields 在同一 objectType 下 code 重复: " + field.objectType() + "." + field.code());
      }
    }
    for (var relation : manifest.relationsOrEmpty()) {
      if ("mapping".equals(profileKind(manifest))) {
        if (!"correspondence".equals(relationKind(manifest, relation))) {
          throw schema("mapping profile 的 relations.kind 必须为 correspondence: " + relation.code());
        }
        requirePublishedProfile(manifest.sourceProfile());
        requirePublishedProfile(manifest.targetProfile());
        requireObjectType(
            objectTypeCodes(publishedTemplateVersion(manifest.sourceProfile())),
            relation.source(),
            "relations.source");
        requireObjectType(
            objectTypeCodes(publishedTemplateVersion(manifest.targetProfile())),
            relation.target(),
            "relations.target");
      } else {
        requireObjectType(objectTypeCodes, relation.source(), "relations.source");
        requireObjectType(objectTypeCodes, relation.target(), "relations.target");
      }
    }
    for (var derived : manifest.derivedOrEmpty()) {
      requireObjectType(objectTypeCodes, derived.objectType(), "derived.objectType");
      validateLanguage(derived.lang(), "derived.lang");
    }
    for (var rule : manifest.rulesOrEmpty()) {
      requireObjectType(objectTypeCodes, rule.objectType(), "rules.objectType");
      validateLanguage(rule.lang(), "rules.lang");
      if (!SEVERITIES.contains(rule.severity())) {
        throw schema("rules.severity 只能为 BLOCK、WARN 或 INFO: " + rule.code());
      }
      if (!blank(rule.field()) && !fields.contains(rule.objectType() + "." + rule.field())) {
        throw schema("rules.field 引用不存在: " + rule.objectType() + "." + rule.field());
      }
    }
    typeCheckOcl(manifest);
  }

  private void validateCatalog(ProfileManifest manifest, Set<String> objectTypeCodes) {
    var directories = new LinkedHashMap<String, ProfileManifest.Directory>();
    for (var directory : manifest.catalogOrEmpty().directoriesOrEmpty()) {
      if (blank(directory.code()) || blank(directory.name()) || directory.sortOrder() == null) {
        throw catalogSchema(manifest, "directory must declare code, name and sortOrder");
      }
      if (directories.putIfAbsent(directory.code(), directory) != null) {
        throw catalogSchema(manifest, "duplicate directory code " + directory.code());
      }
    }
    for (var directory : directories.values()) {
      if (!blank(directory.parentCode()) && !directories.containsKey(directory.parentCode())) {
        throw catalogSchema(manifest, "missing parent directory " + directory.parentCode());
      }
      assertDirectoryAcyclic(manifest, directory.code(), directories, new HashSet<>());
    }
    var placements = new HashSet<String>();
    for (var placement : manifest.catalogOrEmpty().placementsOrEmpty()) {
      if (blank(placement.objectTypeCode())
          || blank(placement.directoryCode())
          || placement.sortOrder() == null) {
        throw catalogSchema(
            manifest, "placement must declare objectTypeCode, directoryCode and sortOrder");
      }
      if (!objectTypeCodes.contains(placement.objectTypeCode())) {
        throw catalogSchema(
            manifest, "placement references unknown object type " + placement.objectTypeCode());
      }
      if (!directories.containsKey(placement.directoryCode())) {
        throw catalogSchema(
            manifest, "placement references unknown directory " + placement.directoryCode());
      }
      if (!placements.add(placement.objectTypeCode())) {
        throw catalogSchema(
            manifest, "duplicate placement for object type " + placement.objectTypeCode());
      }
    }
  }

  private void assertDirectoryAcyclic(
      ProfileManifest manifest,
      String code,
      Map<String, ProfileManifest.Directory> directories,
      Set<String> ancestors) {
    if (!ancestors.add(code)) throw catalogSchema(manifest, "directory cycle at " + code);
    var parent = directories.get(code).parentCode();
    if (!blank(parent)) assertDirectoryAcyclic(manifest, parent, directories, ancestors);
    ancestors.remove(code);
  }

  private static CommandRejectedException catalogSchema(ProfileManifest manifest, String reason) {
    return schema("profile " + manifest.id() + " catalog: " + reason);
  }

  private void typeCheckOcl(ProfileManifest manifest) {
    var model = new ExpressionTypeChecker.Model();
    var valueTypes = new LinkedHashMap<String, String>();
    for (var valueType : manifest.valueTypesOrEmpty()) {
      valueTypes.put(valueType.code(), valueType.basePrimitive());
    }
    for (var objectType : manifest.objectTypesOrEmpty()) {
      model.objectType(objectType.code(), objectType.parentTypeCode());
    }
    for (var field : manifest.fieldsOrEmpty()) {
      model.field(
          field.objectType(),
          field.code(),
          blank(field.dataType()) ? valueTypes.get(field.valueTypeCode()) : field.dataType());
    }
    for (var derived : manifest.derivedOrEmpty()) {
      model.field(derived.objectType(), derived.code(), derived.resultType());
    }
    for (var relation : manifest.relationsOrEmpty()) {
      model.relation(relation.source(), relation.code(), relation.target());
    }
    var checker = new ExpressionTypeChecker(model);
    for (var derived : manifest.derivedOrEmpty()) {
      if (!"ocl".equals(language(derived.lang()))) continue;
      try {
        checker.check(OclParser.parse(derived.derivation()), derived.objectType());
      } catch (RuleSyntaxException failure) {
        throw schema("derived OCL 类型校验失败 " + derived.code() + ": " + failure.getMessage());
      }
    }
    for (var rule : manifest.rulesOrEmpty()) {
      if (!"ocl".equals(language(rule.lang()))) continue;
      try {
        checker.requireBoolean(OclParser.parse(rule.when()), rule.objectType());
      } catch (RuleSyntaxException failure) {
        throw schema("rules OCL 类型校验失败 " + rule.code() + ": " + failure.getMessage());
      }
    }
  }

  private static void validateLanguage(String lang, String field) {
    var language = language(lang);
    if (!"m-expr".equals(language) && !"ocl".equals(language)) {
      throw schema(field + " 只能为 m-expr 或 ocl");
    }
  }

  private static String language(String lang) {
    return blank(lang) ? "m-expr" : lang;
  }

  private UUID objectTypeId(UUID templateVersionId, String code) {
    return jdbc.queryForObject(
        """
        SELECT id FROM object_type
        WHERE workspace_id = ? AND template_version_id = ? AND code = ?
        """,
        UUID.class,
        AUTHOR_WORKSPACE,
        templateVersionId,
        code);
  }

  private Map<String, UUID> objectTypeIds(TemplateVersion version) {
    if (version == null) throw schema("依赖 profile 尚未发布");
    var rows =
        jdbc.query(
            """
            SELECT code, id FROM object_type
            WHERE workspace_id = ? AND template_version_id = ?
            ORDER BY code
            """,
            (row, index) -> Map.entry(row.getString("code"), row.getObject("id", UUID.class)),
            AUTHOR_WORKSPACE,
            version.versionId());
    var values = new LinkedHashMap<String, UUID>();
    rows.forEach(entry -> values.put(entry.getKey(), entry.getValue()));
    return values;
  }

  private Set<String> objectTypeCodes(TemplateVersion version) {
    return objectTypeIds(version).keySet();
  }

  private void requirePublishedProfile(String templateCode) {
    if (publishedTemplateVersion(templateCode) == null) {
      throw schema("mapping profile 依赖尚未发布: " + templateCode);
    }
  }

  private void updateTemplateMetadata(ProfileManifest manifest, UUID versionId) {
    jdbc.update(
        """
        UPDATE scene_template
        SET profile_kind = ?, source_profile_code = ?, target_profile_code = ?
        WHERE code = ?
        """,
        profileKind(manifest),
        blank(manifest.sourceProfile()) ? null : manifest.sourceProfile(),
        blank(manifest.targetProfile()) ? null : manifest.targetProfile(),
        manifest.templateCode());
    jdbc.update(
        """
        UPDATE scene_template_version
        SET tags = ?::jsonb
        WHERE id = ?
        """,
        tagsJson(manifest),
        versionId);
  }

  private String tagsJson(ProfileManifest manifest) {
    var tags = manifest.tagsOrEmpty();
    try {
      return mapper.writeValueAsString(
          Map.of(
              "profileVersion",
              manifest.version(),
              "industry",
              cleanTags(tags.industryOrEmpty()),
              "profession",
              cleanTags(tags.professionOrEmpty()),
              "scenario",
              cleanTags(tags.scenarioOrEmpty())));
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw schema("profile tags 无法序列化");
    }
  }

  private List<String> cleanTags(List<String> values) {
    return values.stream().filter(value -> !blank(value)).map(String::trim).distinct().toList();
  }

  private String relationKind(ProfileManifest manifest, ProfileManifest.Relation relation) {
    if (!blank(relation.kind())) return relation.kind();
    return "mapping".equals(profileKind(manifest)) ? "correspondence" : "domain";
  }

  private String profileKind(ProfileManifest manifest) {
    return blank(manifest.kind()) ? "domain" : manifest.kind();
  }

  private void ensureAuthorWorkspace() {
    jdbc.update(
        """
        INSERT INTO workspace (id, name, status)
        VALUES (?, 'Profile Author Workspace', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
        """,
        AUTHOR_WORKSPACE);
    jdbc.update(
        """
        INSERT INTO value_type (
          id, workspace_id, template_version_id, code, name, base_primitive,
          parent_value_type_id, constraints, published, version
        )
        SELECT md5(?::text || ':value_type:' || root.code)::uuid,
               ?, NULL, root.code, root.name, root.code, NULL, '{}'::jsonb, TRUE, 1
        FROM (
          VALUES
            ('string', 'String'), ('text', 'Text'), ('integer', 'Integer'), ('number', 'Number'),
            ('boolean', 'Boolean'), ('date', 'Date'), ('datetime', 'Datetime'), ('enum', 'Enum'),
            ('ref', 'Reference'), ('json', 'Json')
        ) AS root(code, name)
        WHERE NOT EXISTS (
          SELECT 1 FROM value_type existing
          WHERE existing.workspace_id = ?
            AND existing.template_version_id IS NULL
            AND existing.code = root.code
        )
        """,
        AUTHOR_WORKSPACE.toString(),
        AUTHOR_WORKSPACE,
        AUTHOR_WORKSPACE);
  }

  private TemplateVersion latestTemplateVersion(String templateCode) {
    var rows =
        jdbc.query(
            """
            SELECT template.id, version.id, version.version, version.status
            FROM scene_template template
            JOIN scene_template_version version ON version.template_id = template.id
            WHERE template.code = ?
            ORDER BY version.version DESC
            LIMIT 1
            """,
            (row, index) ->
                new TemplateVersion(
                    row.getObject(1, UUID.class),
                    row.getObject(2, UUID.class),
                    row.getInt(3),
                    row.getString(4)),
            templateCode);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private TemplateVersion publishedTemplateVersion(String templateCode) {
    var rows =
        jdbc.query(
            """
            SELECT template.id, version.id, version.version, version.status
            FROM scene_template template
            JOIN scene_template_version version ON version.template_id = template.id
            WHERE template.code = ? AND version.status = 'published'
            ORDER BY version.version DESC
            LIMIT 1
            """,
            (row, index) ->
                new TemplateVersion(
                    row.getObject(1, UUID.class),
                    row.getObject(2, UUID.class),
                    row.getInt(3),
                    row.getString(4)),
            templateCode);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private FieldConstraints constraints(JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return FieldConstraints.empty();
    }
    return mapper.convertValue(node, FieldConstraints.class);
  }

  private String constraintsJson(JsonNode node) {
    try {
      return mapper.writeValueAsString(constraints(node).asMap());
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw schema("fields.constraints 无法序列化");
    }
  }

  private UUID detailUuid(CommandResult result, String key) {
    var prefix = key + "=";
    for (var event : result.events()) {
      if (event.startsWith(prefix)) {
        return UUID.fromString(event.substring(prefix.length()));
      }
    }
    throw new IllegalStateException("命令结果缺少 " + key);
  }

  private static void unique(List<String> codes, String field) {
    var seen = new HashSet<String>();
    for (var code : codes) {
      if (blank(code)) throw schema(field + " 必填");
      if (!seen.add(code)) throw schema(field + " 重复: " + code);
    }
  }

  private static void requireObjectType(Set<String> codes, String code, String field) {
    if (blank(code) || !codes.contains(code)) {
      throw schema(field + " 引用不存在: " + code);
    }
  }

  private static UUID correlation() {
    return UUID.randomUUID();
  }

  private static String key(ProfileManifest manifest, String step, String... parts) {
    return key(
        manifest.templateCode(), manifest.version() + ":" + step + ":" + String.join(":", parts));
  }

  private static String key(String templateCode, String step) {
    return "profile-" + sha256(templateCode + ":" + step).substring(0, 40);
  }

  private static String sha256(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }

  private static boolean blank(String value) {
    return value == null || value.isBlank();
  }

  private static CommandRejectedException schema(String message) {
    return new CommandRejectedException(
        new CommandError("META-400-SCHEMA-INVALID", message, Map.of(), "修正 profile manifest 后重试"));
  }

  private record TemplateVersion(UUID templateId, UUID versionId, int version, String status) {}

  private record FieldType(DataType dataType, UUID valueTypeId) {}
}
