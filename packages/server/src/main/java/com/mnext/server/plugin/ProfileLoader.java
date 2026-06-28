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
  private static final UUID AUTHOR_WORKSPACE =
      UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final Set<String> SEVERITIES = Set.of("BLOCK", "WARN", "INFO");

  private final MetaCommandService commands;
  private final DerivedFieldRepository derivedFields;
  private final RuleDefRepository rules;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  ProfileLoader(
      MetaCommandService commands,
      DerivedFieldRepository derivedFields,
      RuleDefRepository rules,
      JdbcTemplate jdbc,
      ObjectMapper mapper) {
    this.commands = commands;
    this.derivedFields = derivedFields;
    this.rules = rules;
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Transactional
  public void install(ProfileManifest manifest, Actor actor) {
    validate(manifest);
    var existing = latestTemplateVersion(manifest.templateCode());
    if (existing != null) {
      if ("published".equals(existing.status())) {
        return;
      }
      if ("withdrawn".equals(existing.status())) {
        commands.restoreTemplateVersion(
            new RestoreTemplateVersionCommand(
                AUTHOR_WORKSPACE, correlation(), key(manifest, "restore"), existing.versionId()),
            actor);
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
  }

  @Transactional
  public void uninstall(String templateCode, Actor actor) {
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
              constraints(field.constraints())),
          actor);
    }
  }

  private void defineRelations(
      ProfileManifest manifest, UUID versionId, Map<String, UUID> objectTypeIds, Actor actor) {
    for (var relation : manifest.relationsOrEmpty()) {
      commands.defineRelationType(
          new DefineRelationTypeCommand(
              AUTHOR_WORKSPACE,
              correlation(),
              key(manifest, "relation", relation.code()),
              relation.code(),
              relation.name(),
              objectTypeIds.get(relation.source()),
              objectTypeIds.get(relation.target()),
              relation.direction(),
              relation.cardinality(),
              relation.semantics(),
              Boolean.TRUE.equals(relation.hierarchical()),
              versionId),
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
              derived.derivation()),
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
              rule.when(),
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
      requireObjectType(objectTypeCodes, relation.source(), "relations.source");
      requireObjectType(objectTypeCodes, relation.target(), "relations.target");
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

  private void typeCheckOcl(ProfileManifest manifest) {
    var model = new ExpressionTypeChecker.Model();
    for (var field : manifest.fieldsOrEmpty()) {
      model.field(field.objectType(), field.code(), field.dataType());
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
}
