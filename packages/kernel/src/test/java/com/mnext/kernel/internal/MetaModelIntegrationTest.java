package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.metamodel.ApplyTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.DefineValueTypeCommand;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import com.mnext.kernel.api.metamodel.PublishTemplateVersionCommand;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(classes = MetaModelIntegrationTest.TestApplication.class)
class MetaModelIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));

  @SpringBootConfiguration
  @EnableAutoConfiguration
  @ComponentScan("com.mnext.kernel.internal")
  static class TestApplication {}

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired MetaCommandService meta;
  @Autowired KernelCommandService commands;
  @Autowired JdbcTemplate jdbc;

  @Test
  void authoringChainValidatesTypedObjectValues() {
    var actor = Actor.user("model-author");
    meta.defineObjectType(
        new DefineObjectTypeCommand(
            WORKSPACE, UUID.randomUUID(), "chain-object", null, "requirement_v33", "需求"),
        actor);
    var typeId =
        jdbc.queryForObject(
            "SELECT id FROM object_type WHERE workspace_id = ? AND code = 'requirement_v33'",
            UUID.class,
            WORKSPACE);
    meta.defineFieldDef(
        new DefineFieldDefCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "chain-field",
            typeId,
            "budget",
            "预算",
            DataType.NUMBER,
            false,
            new FieldConstraints(null, null, BigDecimal.ZERO, null, null, null, null)),
        actor);
    meta.defineRelationType(
        new DefineRelationTypeCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "chain-relation",
            "decomposes_v33",
            "分解",
            typeId,
            typeId,
            "directed",
            "one_to_many",
            "strong",
            true),
        actor);
    jdbc.update("UPDATE object_type SET published = TRUE WHERE id = ?", typeId);

    var invalid =
        assertThrows(
            CommandRejectedException.class,
            () -> commands.createObject(create(typeId, "chain-invalid", -1), actor));
    commands.createObject(create(typeId, "chain-valid", 5), actor);

    assertEquals("KERNEL-422-FIELD-VALUE-INVALID", invalid.error().code());
    assertEquals(
        "model-author",
        jdbc.queryForObject(
            "SELECT created_by FROM field_def WHERE object_type_id = ? AND code = 'budget'",
            String.class,
            typeId));
    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM data_object value JOIN object_type type ON type.id = value.object_type_id
            WHERE type.code = 'requirement_v33'
            """,
            Long.class));
  }

  @Test
  void generalizationResolvesValueTypesInheritedFieldsAndIsaEndpoints() {
    var actor = Actor.user("model-author");
    meta.defineValueType(
        new DefineValueTypeCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "vt-paragraph",
            null,
            "paragraph_v33",
            "自然段",
            DataType.TEXT,
            "text",
            new FieldConstraints(null, 10, null, null, null, null, null, true)),
        actor);
    var requirement = defineObject("requirement_gen", "需求", null, actor);
    meta.defineFieldDef(
        new DefineFieldDefCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "field-name",
            requirement,
            "name",
            "名称",
            null,
            "paragraph_v33",
            true,
            FieldConstraints.empty()),
        actor);
    var performance = defineObject("performance_requirement_gen", "性能需求", "requirement_gen", actor);
    var holder = defineObject("holder_gen", "容器", null, actor);
    meta.defineFieldDef(
        new DefineFieldDefCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "field-ref",
            holder,
            "requirement_ref",
            "需求引用",
            DataType.REF,
            false,
            new FieldConstraints(null, null, null, null, null, null, "requirement_gen")),
        actor);
    meta.defineRelationType(
        new DefineRelationTypeCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "rel-isa",
            "traces_gen",
            "追踪",
            requirement,
            requirement,
            "directed",
            "many_to_many",
            "weak",
            false),
        actor);
    publish(requirement, performance, holder);

    var missingInherited =
        assertThrows(
            CommandRejectedException.class,
            () -> commands.createObject(create(performance, "missing-inherited", Map.of()), actor));
    assertEquals("KERNEL-422-FIELD-VALUE-INVALID", missingInherited.error().code());

    var tooLong =
        assertThrows(
            CommandRejectedException.class,
            () ->
                commands.createObject(
                    create(performance, "too-long", Map.of("name", "abcdefghijkl")), actor));
    assertEquals("KERNEL-422-FIELD-VALUE-INVALID", tooLong.error().code());

    commands.createObject(create(performance, "valid-child", Map.of("name", "fast")), actor);
    commands.createObject(create(requirement, "valid-parent", Map.of("name", "base")), actor);
    var childObject =
        jdbc.queryForObject(
            """
            SELECT value.id FROM data_object value
            WHERE value.object_type_id = ? ORDER BY value.created_at DESC LIMIT 1
            """,
            UUID.class,
            performance);
    var parentObject =
        jdbc.queryForObject(
            """
            SELECT value.id FROM data_object value
            WHERE value.object_type_id = ? ORDER BY value.created_at DESC LIMIT 1
            """,
            UUID.class,
            requirement);
    commands.createObject(
        create(holder, "valid-ref", Map.of("requirement_ref", childObject.toString())), actor);
    commands.createRelation(
        new CreateRelationCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "valid-relation-isa",
            relationType("traces_gen"),
            childObject,
            parentObject,
            Map.of(),
            new SourceInfo("manual", null)),
        actor);

    assertEquals(
        1L,
        jdbc.queryForObject(
            "SELECT count(*) FROM data_relation WHERE relation_type_id = ?",
            Long.class,
            relationType("traces_gen")));
  }

  @Test
  void fieldRedefinitionNarrowsInheritedFieldAndValidatesObjects() {
    var actor = Actor.user("model-author");
    meta.defineValueType(
        new DefineValueTypeCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "vt-short-paragraph",
            null,
            "short_paragraph_genb",
            "短自然段",
            DataType.TEXT,
            "text",
            new FieldConstraints(null, 5, null, null, null, null, null, true)),
        actor);
    var requirement = defineObject("requirement_genb", "需求", null, actor);
    meta.defineFieldDef(
        new DefineFieldDefCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "field-base-name",
            requirement,
            "name",
            "名称",
            null,
            "text",
            false,
            new FieldConstraints(null, 10, null, null, null, null, null)),
        actor);
    var performance =
        defineObject("performance_requirement_genb", "性能需求", "requirement_genb", actor);
    meta.defineFieldDef(
        new DefineFieldDefCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "field-redefine-name",
            performance,
            "name",
            "名称",
            null,
            "short_paragraph_genb",
            true,
            "name",
            FieldConstraints.empty()),
        actor);
    publish(requirement, performance);

    var missing =
        assertThrows(
            CommandRejectedException.class,
            () -> commands.createObject(create(performance, "redefined-missing", Map.of()), actor));
    var tooLong =
        assertThrows(
            CommandRejectedException.class,
            () ->
                commands.createObject(
                    create(performance, "redefined-too-long", Map.of("name", "123456")), actor));
    commands.createObject(create(performance, "redefined-valid", Map.of("name", "12345")), actor);

    assertEquals("KERNEL-422-FIELD-VALUE-INVALID", missing.error().code());
    assertEquals("KERNEL-422-FIELD-VALUE-INVALID", tooLong.error().code());
    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM field_def child
            JOIN field_def parent ON parent.id = child.redefines_field_def_id
            WHERE child.object_type_id = ? AND child.code = 'name' AND parent.object_type_id = ?
            """,
            Long.class,
            performance,
            requirement));
  }

  @Test
  void publishTemplateVersionRejectsEmptyAndAlreadyPublishedVersions() {
    var actor = Actor.user("template-author");
    var empty = draftTemplate("empty_publish");

    var emptyError =
        assertThrows(
            CommandRejectedException.class,
            () ->
                meta.publishTemplateVersion(
                    new PublishTemplateVersionCommand(
                        WORKSPACE, UUID.randomUUID(), "publish-empty", empty.versionId()),
                    actor));
    assertEquals("KERNEL-422-TEMPLATE-EMPTY", emptyError.error().code());

    var draft = draftTemplate("publish_once");
    defineTemplateObject(draft.versionId(), "publishable_type", "可发布类型", null, actor);
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-ok", draft.versionId()),
        actor);

    assertEquals(
        "published",
        jdbc.queryForObject(
            "SELECT status FROM scene_template_version WHERE id = ?",
            String.class,
            draft.versionId()));
    var immutable =
        assertThrows(
            CommandRejectedException.class,
            () ->
                meta.publishTemplateVersion(
                    new PublishTemplateVersionCommand(
                        WORKSPACE, UUID.randomUUID(), "publish-again", draft.versionId()),
                    actor));
    assertEquals("KERNEL-409-TEMPLATE-VERSION-IMMUTABLE", immutable.error().code());
  }

  @Test
  void instantiateWorkspaceRequiresPublishedTemplateVersion() {
    var draft = draftTemplate("instantiate_draft");
    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                meta.instantiateWorkspace(
                    new InstantiateWorkspaceCommand(
                        WORKSPACE,
                        UUID.randomUUID(),
                        "instantiate-draft",
                        draft.templateId(),
                        1,
                        UUID.randomUUID(),
                        "Draft Instance"),
                    Actor.user("template-author")));

    assertEquals("KERNEL-422-TEMPLATE-NOT-PUBLISHED", error.error().code());
  }

  @Test
  void instantiateWorkspaceCopiesTypesClosesReferencesAndReplaysIdempotently() {
    var actor = Actor.user("template-author");
    var draft = draftTemplate("instantiate_full");
    meta.defineValueType(
        new DefineValueTypeCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "vt-template-short",
            draft.versionId(),
            "short_text_tpl",
            "短文本",
            DataType.TEXT,
            "text",
            new FieldConstraints(null, 20, null, null, null, null, null, true)),
        actor);
    meta.defineValueType(
        new DefineValueTypeCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "vt-template-tiny",
            draft.versionId(),
            "tiny_text_tpl",
            "更短文本",
            DataType.TEXT,
            "short_text_tpl",
            new FieldConstraints(null, 10, null, null, null, null, null, true)),
        actor);
    var requirement = defineTemplateObject(draft.versionId(), "requirement_tpl", "需求", null, actor);
    meta.defineFieldDef(
        new DefineFieldDefCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "field-template-name",
            requirement,
            "name",
            "名称",
            null,
            "short_text_tpl",
            true,
            FieldConstraints.empty()),
        actor);
    var performance =
        defineTemplateObject(
            draft.versionId(), "performance_requirement_tpl", "性能需求", "requirement_tpl", actor);
    meta.defineFieldDef(
        new DefineFieldDefCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "field-template-redefine",
            performance,
            "name",
            "名称",
            null,
            "tiny_text_tpl",
            true,
            "name",
            FieldConstraints.empty()),
        actor);
    insertTemplateRelationType(draft.versionId(), requirement, performance);
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-full-template", draft.versionId()),
        actor);

    var newWorkspace = UUID.randomUUID();
    var command =
        new InstantiateWorkspaceCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "instantiate-full",
            draft.templateId(),
            1,
            newWorkspace,
            "实例化工作空间");
    var first = meta.instantiateWorkspace(command, actor);
    var second = meta.instantiateWorkspace(command, actor);

    assertEquals(false, first.idempotentReplay());
    assertEquals(true, second.idempotentReplay());
    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM workspace
            WHERE id = ? AND template_id = ? AND template_version = 1 AND status = 'ACTIVE'
            """,
            Long.class,
            newWorkspace,
            draft.templateId()));
    assertCopiedTypeGraph(newWorkspace);
    var newPerformance =
        jdbc.queryForObject(
            """
            SELECT id FROM object_type
            WHERE workspace_id = ? AND code = 'performance_requirement_tpl'
            """,
            UUID.class,
            newWorkspace);
    commands.createObject(
        new CreateObjectCommand(
            newWorkspace,
            UUID.randomUUID(),
            "instantiate-create-object",
            newPerformance,
            Map.of("name", "fast"),
            new SourceInfo("manual", null),
            null),
        actor);

    assertEquals(
        1L,
        jdbc.queryForObject(
            "SELECT count(*) FROM data_object WHERE workspace_id = ?", Long.class, newWorkspace));
  }

  @Test
  void applyTemplateVersionAppliesEnumExpansionOnly() {
    var actor = Actor.user("template-author");
    var draft = draftTemplate("apply_enum");
    var sourceType =
        insertTemplateObject(WORKSPACE, draft.versionId(), "apply_requirement_enum", "需求", null);
    insertTemplateField(
        sourceType,
        draft.versionId(),
        "status",
        "状态",
        DataType.ENUM,
        false,
        enumConstraints("draft"),
        null);
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-apply-enum-v1", draft.versionId()),
        actor);
    var target = instantiate(draft, "apply-enum-instance", actor);
    var v2Author = authorWorkspace("apply_enum_v2_author");
    var v2 = templateVersion(draft.templateId(), 2, "published");
    var targetType = insertTemplateObject(v2Author, v2, "apply_requirement_enum", "需求", null);
    insertTemplateField(
        targetType,
        v2,
        "status",
        "状态",
        DataType.ENUM,
        false,
        enumConstraints("draft", "approved"),
        null);

    meta.applyTemplateVersion(
        new ApplyTemplateVersionCommand(target, UUID.randomUUID(), "apply-enum-v2", 2), actor);

    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM field_def field
            JOIN object_type type ON type.id = field.object_type_id
            WHERE type.workspace_id = ? AND field.code = 'status'
              AND jsonb_exists(field.constraints->'enumValues', 'approved')
            """,
            Long.class,
            target));
    var runtimeType = runtimeType(target, "apply_requirement_enum");
    commands.createObject(
        new CreateObjectCommand(
            target,
            UUID.randomUUID(),
            "apply-enum-approved",
            runtimeType,
            Map.of("status", "approved"),
            new SourceInfo("manual", null),
            null),
        actor);
    assertEquals(2, workspaceTemplateVersion(target));
  }

  @Test
  void applyTemplateVersionAppliesNewOptionalField() {
    var actor = Actor.user("template-author");
    var draft = draftTemplate("apply_optional");
    insertTemplateObject(WORKSPACE, draft.versionId(), "apply_optional_type", "类型", null);
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-apply-optional-v1", draft.versionId()),
        actor);
    var target = instantiate(draft, "apply-optional-instance", actor);
    var v2Author = authorWorkspace("apply_optional_v2_author");
    var v2 = templateVersion(draft.templateId(), 2, "published");
    var nextType = insertTemplateObject(v2Author, v2, "apply_optional_type", "类型", null);
    insertTemplateField(
        nextType, v2, "nickname", "昵称", DataType.STRING, false, FieldConstraints.empty(), null);

    meta.applyTemplateVersion(
        new ApplyTemplateVersionCommand(target, UUID.randomUUID(), "apply-optional-v2", 2), actor);

    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM field_def field
            JOIN object_type type ON type.id = field.object_type_id
            WHERE type.workspace_id = ? AND type.code = 'apply_optional_type'
              AND field.code = 'nickname' AND field.required = FALSE
            """,
            Long.class,
            target));
    commands.createObject(
        new CreateObjectCommand(
            target,
            UUID.randomUUID(),
            "apply-optional-object",
            runtimeType(target, "apply_optional_type"),
            Map.of("nickname", "safe"),
            new SourceInfo("manual", null),
            null),
        actor);
    assertEquals(2, workspaceTemplateVersion(target));
  }

  @Test
  void applyTemplateVersionAppliesNewSubtypeRelationAndRelaxedConstraint() {
    var actor = Actor.user("template-author");
    var draft = draftTemplate("apply_additive");
    var base =
        insertTemplateObject(WORKSPACE, draft.versionId(), "apply_additive_base", "基础", null);
    insertTemplateField(
        base,
        draft.versionId(),
        "name",
        "名称",
        DataType.STRING,
        false,
        new FieldConstraints(null, 5, null, null, null, null, null),
        null);
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-apply-additive-v1", draft.versionId()),
        actor);
    var target = instantiate(draft, "apply-additive-instance", actor);
    var v2Author = authorWorkspace("apply_additive_v2_author");
    var v2 = templateVersion(draft.templateId(), 2, "published");
    var nextBase = insertTemplateObject(v2Author, v2, "apply_additive_base", "基础", null);
    insertTemplateField(
        nextBase,
        v2,
        "name",
        "名称",
        DataType.STRING,
        false,
        new FieldConstraints(null, 10, null, null, null, null, null),
        null);
    var child =
        insertTemplateObject(v2Author, v2, "apply_additive_child", "子类型", "apply_additive_base");
    insertTemplateRelationType(v2Author, v2, "apply_additive_rel", nextBase, child);

    meta.applyTemplateVersion(
        new ApplyTemplateVersionCommand(target, UUID.randomUUID(), "apply-additive-v2", 2), actor);

    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM object_type child
            JOIN object_type parent ON parent.id = child.parent_type_id
            WHERE child.workspace_id = ? AND parent.workspace_id = ?
              AND child.code = 'apply_additive_child'
              AND parent.code = 'apply_additive_base'
            """,
            Long.class,
            target,
            target));
    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM relation_type relation
            JOIN object_type source_type ON source_type.id = relation.source_type
            JOIN object_type target_type ON target_type.id = relation.target_type
            WHERE relation.workspace_id = ? AND relation.code = 'apply_additive_rel'
              AND source_type.workspace_id = ? AND target_type.workspace_id = ?
            """,
            Long.class,
            target,
            target,
            target));
    commands.createObject(
        new CreateObjectCommand(
            target,
            UUID.randomUUID(),
            "apply-additive-child-object",
            runtimeType(target, "apply_additive_child"),
            Map.of("name", "123456789"),
            new SourceInfo("manual", null),
            null),
        actor);
    assertEquals(2, workspaceTemplateVersion(target));
  }

  @Test
  void applyTemplateVersionRejectsUnpublishedTargetVersion() {
    var actor = Actor.user("template-author");
    var draft = draftTemplate("apply_unpublished");
    insertTemplateObject(WORKSPACE, draft.versionId(), "apply_unpublished_type", "类型", null);
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-apply-unpublished-v1", draft.versionId()),
        actor);
    var target = instantiate(draft, "apply-unpublished-instance", actor);
    templateVersion(draft.templateId(), 2, "draft");

    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                meta.applyTemplateVersion(
                    new ApplyTemplateVersionCommand(
                        target, UUID.randomUUID(), "apply-unpublished-v2", 2),
                    actor));

    assertEquals("KERNEL-422-TEMPLATE-NOT-PUBLISHED", error.error().code());
  }

  @Test
  void applyTemplateVersionBlocksNewRequiredFieldWithAffectedObjects() {
    var actor = Actor.user("template-author");
    var draft = draftTemplate("apply_required");
    insertTemplateObject(WORKSPACE, draft.versionId(), "apply_required_type", "类型", null);
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-apply-required-v1", draft.versionId()),
        actor);
    var target = instantiate(draft, "apply-required-instance", actor);
    var runtimeType = runtimeType(target, "apply_required_type");
    commands.createObject(
        new CreateObjectCommand(
            target,
            UUID.randomUUID(),
            "apply-required-object",
            runtimeType,
            Map.of(),
            new SourceInfo("manual", null),
            null),
        actor);
    var v2Author = authorWorkspace("apply_required_v2_author");
    var v2 = templateVersion(draft.templateId(), 2, "published");
    var nextType = insertTemplateObject(v2Author, v2, "apply_required_type", "类型", null);
    insertTemplateField(
        nextType, v2, "name", "名称", DataType.STRING, true, FieldConstraints.empty(), null);

    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                meta.applyTemplateVersion(
                    new ApplyTemplateVersionCommand(
                        target, UUID.randomUUID(), "apply-required-v2", 2),
                    actor));

    assertEquals("KERNEL-409-TEMPLATE-MIGRATION-REQUIRED", error.error().code());
    assertEquals(1, workspaceTemplateVersion(target));
    var affected = (List<?>) error.error().details().get("affected");
    assertEquals(false, affected.isEmpty());
  }

  @Test
  void applyTemplateVersionBlocksMixedTighteningWithoutPartialApply() {
    var actor = Actor.user("template-author");
    var draft = draftTemplate("apply_mixed");
    var sourceType =
        insertTemplateObject(WORKSPACE, draft.versionId(), "apply_mixed_type", "类型", null);
    insertTemplateField(
        sourceType,
        draft.versionId(),
        "name",
        "名称",
        DataType.STRING,
        false,
        new FieldConstraints(null, 10, null, null, null, null, null),
        null);
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-apply-mixed-v1", draft.versionId()),
        actor);
    var target = instantiate(draft, "apply-mixed-instance", actor);
    var v2Author = authorWorkspace("apply_mixed_v2_author");
    var v2 = templateVersion(draft.templateId(), 2, "published");
    var nextType = insertTemplateObject(v2Author, v2, "apply_mixed_type", "类型", null);
    insertTemplateField(
        nextType,
        v2,
        "name",
        "名称",
        DataType.STRING,
        false,
        new FieldConstraints(null, 5, null, null, null, null, null),
        null);
    insertTemplateField(
        nextType, v2, "nickname", "昵称", DataType.STRING, false, FieldConstraints.empty(), null);

    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                meta.applyTemplateVersion(
                    new ApplyTemplateVersionCommand(target, UUID.randomUUID(), "apply-mixed-v2", 2),
                    actor));

    assertEquals("KERNEL-409-TEMPLATE-MIGRATION-REQUIRED", error.error().code());
    assertEquals(1, workspaceTemplateVersion(target));
    assertEquals(
        0L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM field_def field
            JOIN object_type type ON type.id = field.object_type_id
            WHERE type.workspace_id = ? AND type.code = 'apply_mixed_type'
              AND field.code = 'nickname'
            """,
            Long.class,
            target));
  }

  @Test
  void applyTemplateVersionBlocksParentTypeChangeAndRedefinitionWidening() {
    var actor = Actor.user("template-author");
    var draft = draftTemplate("apply_gend");
    var base = insertTemplateObject(WORKSPACE, draft.versionId(), "apply_base_type", "基础", null);
    insertTemplateField(
        base,
        draft.versionId(),
        "name",
        "名称",
        DataType.STRING,
        false,
        new FieldConstraints(null, 10, null, null, null, null, null),
        null);
    var child =
        insertTemplateObject(
            WORKSPACE, draft.versionId(), "apply_child_type", "子类", "apply_base_type");
    insertTemplateObject(
        WORKSPACE, draft.versionId(), "apply_parent_change_type", "父级变更类", "apply_base_type");
    insertTemplateField(
        child,
        draft.versionId(),
        "name",
        "名称",
        DataType.STRING,
        false,
        new FieldConstraints(null, 5, null, null, null, null, null),
        "name");
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-apply-gend-v1", draft.versionId()),
        actor);
    var target = instantiate(draft, "apply-gend-instance", actor);
    var childRuntime = runtimeType(target, "apply_child_type");
    commands.createObject(
        new CreateObjectCommand(
            target,
            UUID.randomUUID(),
            "apply-gend-object",
            childRuntime,
            Map.of("name", "abc"),
            new SourceInfo("manual", null),
            null),
        actor);
    var v2Author = authorWorkspace("apply_gend_v2_author");
    var v2 = templateVersion(draft.templateId(), 2, "published");
    var nextBase = insertTemplateObject(v2Author, v2, "apply_base_type", "基础", null);
    insertTemplateField(
        nextBase,
        v2,
        "name",
        "名称",
        DataType.STRING,
        false,
        new FieldConstraints(null, 10, null, null, null, null, null),
        null);
    insertTemplateObject(v2Author, v2, "apply_parent_change_type", "父级变更类", null);
    var nextChild = insertTemplateObject(v2Author, v2, "apply_child_type", "子类", "apply_base_type");
    insertTemplateField(
        nextChild,
        v2,
        "name",
        "名称",
        DataType.STRING,
        false,
        new FieldConstraints(null, 20, null, null, null, null, null),
        "name");

    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                meta.applyTemplateVersion(
                    new ApplyTemplateVersionCommand(target, UUID.randomUUID(), "apply-gend-v2", 2),
                    actor));

    assertEquals("KERNEL-409-TEMPLATE-MIGRATION-REQUIRED", error.error().code());
    assertEquals(1, workspaceTemplateVersion(target));
  }

  private static CreateObjectCommand create(UUID typeId, String key, Object budget) {
    return create(typeId, key, Map.of("budget", budget));
  }

  private record DraftTemplate(UUID templateId, UUID versionId) {}

  private DraftTemplate draftTemplate(String code) {
    var template = UUID.randomUUID();
    var version = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template (id, code, name, created_by, created_at)
        VALUES (?, ?, ?, 'test', CURRENT_TIMESTAMP)
        """,
        template,
        code,
        code);
    jdbc.update(
        """
        INSERT INTO scene_template_version (id, template_id, version, status)
        VALUES (?, ?, 1, 'draft')
        """,
        version,
        template);
    return new DraftTemplate(template, version);
  }

  private UUID templateVersion(UUID templateId, int versionNumber, String status) {
    var version = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template_version (id, template_id, version, status)
        VALUES (?, ?, ?, ?)
        """,
        version,
        templateId,
        versionNumber,
        status);
    return version;
  }

  private UUID authorWorkspace(String name) {
    var workspace = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, ?, 'ACTIVE')", workspace, name);
    return workspace;
  }

  private UUID insertTemplateObject(
      UUID workspaceId, UUID versionId, String code, String name, String parentCode) {
    var id = UUID.randomUUID();
    var parentId =
        parentCode == null
            ? null
            : jdbc.queryForObject(
                """
                SELECT id FROM object_type
                WHERE workspace_id = ? AND code = ?
                """,
                UUID.class,
                workspaceId,
                parentCode);
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, template_version_id, code, name, parent_type_id, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, FALSE, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        id,
        workspaceId,
        versionId,
        code,
        name,
        parentId);
    return id;
  }

  private UUID insertTemplateField(
      UUID objectTypeId,
      UUID versionId,
      String code,
      String name,
      DataType dataType,
      boolean required,
      FieldConstraints constraints,
      String redefinesFieldCode) {
    var id = UUID.randomUUID();
    var redefines =
        redefinesFieldCode == null
            ? null
            : jdbc.queryForObject(
                """
                WITH RECURSIVE ancestors AS (
                  SELECT parent.id, parent.parent_type_id
                  FROM object_type child
                  JOIN object_type parent ON parent.id = child.parent_type_id
                  WHERE child.id = ?
                  UNION ALL
                  SELECT parent.id, parent.parent_type_id
                  FROM object_type parent
                  JOIN ancestors child ON parent.id = child.parent_type_id
                )
                SELECT field.id FROM field_def field
                JOIN ancestors ON ancestors.id = field.object_type_id
                WHERE field.code = ?
                LIMIT 1
                """,
                UUID.class,
                objectTypeId,
                redefinesFieldCode);
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, template_version_id, code, name, required, data_type,
           value_type_id, constraints, redefines_field_def_id, created_by, updated_by,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, CAST(? AS jsonb), ?, 'test', 'test',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        id,
        objectTypeId,
        versionId,
        code,
        name,
        required,
        dataType.code(),
        JsonCodec.encode(constraints.asMap()),
        redefines);
    return id;
  }

  private FieldConstraints enumConstraints(String... values) {
    return new FieldConstraints(null, null, null, null, null, List.of(values), null);
  }

  private UUID instantiate(DraftTemplate draft, String key, Actor actor) {
    var workspace = UUID.randomUUID();
    meta.instantiateWorkspace(
        new InstantiateWorkspaceCommand(
            WORKSPACE, UUID.randomUUID(), key, draft.templateId(), 1, workspace, key),
        actor);
    return workspace;
  }

  private UUID runtimeType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private int workspaceTemplateVersion(UUID workspace) {
    return jdbc.queryForObject(
        "SELECT template_version FROM workspace WHERE id = ?", Integer.class, workspace);
  }

  private UUID defineTemplateObject(
      UUID versionId, String code, String name, String parentCode, Actor actor) {
    meta.defineObjectType(
        new DefineObjectTypeCommand(
            WORKSPACE, UUID.randomUUID(), "object-" + code, versionId, code, name, parentCode),
        actor);
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        WORKSPACE,
        code);
  }

  private void insertTemplateRelationType(UUID versionId, UUID sourceType, UUID targetType) {
    insertTemplateRelationType(WORKSPACE, versionId, "satisfies_tpl", sourceType, targetType);
  }

  private void insertTemplateRelationType(
      UUID workspaceId, UUID versionId, String code, UUID sourceType, UUID targetType) {
    jdbc.update(
        """
        INSERT INTO relation_type
          (id, workspace_id, template_version_id, code, source_type, target_type, direction,
           cardinality, semantics, hierarchical, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'directed', 'many_to_many', 'weak', FALSE,
          'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        UUID.randomUUID(),
        workspaceId,
        versionId,
        code,
        sourceType,
        targetType);
  }

  private void assertCopiedTypeGraph(UUID workspace) {
    assertEquals(
        0L,
        jdbc.queryForObject(
            "SELECT count(*) FROM object_type WHERE workspace_id = ? AND template_version_id IS NOT NULL",
            Long.class,
            workspace));
    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM object_type child
            JOIN object_type parent ON parent.id = child.parent_type_id
            WHERE child.workspace_id = ? AND parent.workspace_id = ?
              AND child.code = 'performance_requirement_tpl'
              AND parent.code = 'requirement_tpl'
            """,
            Long.class,
            workspace,
            workspace));
    assertEquals(
        2L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM field_def field
            JOIN value_type value_type ON value_type.id = field.value_type_id
            WHERE field.code = 'name' AND value_type.workspace_id = ?
            """,
            Long.class,
            workspace));
    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM field_def child
            JOIN field_def parent ON parent.id = child.redefines_field_def_id
            JOIN object_type child_type ON child_type.id = child.object_type_id
            JOIN object_type parent_type ON parent_type.id = parent.object_type_id
            WHERE child_type.workspace_id = ? AND parent_type.workspace_id = ?
            """,
            Long.class,
            workspace,
            workspace));
    assertEquals(
        1L,
        jdbc.queryForObject(
            """
            SELECT count(*) FROM relation_type relation
            JOIN object_type source_type ON source_type.id = relation.source_type
            JOIN object_type target_type ON target_type.id = relation.target_type
            WHERE relation.workspace_id = ? AND source_type.workspace_id = ?
              AND target_type.workspace_id = ?
            """,
            Long.class,
            workspace,
            workspace,
            workspace));
  }

  private static CreateObjectCommand create(UUID typeId, String key, Map<String, Object> fields) {
    return new CreateObjectCommand(
        WORKSPACE, UUID.randomUUID(), key, typeId, fields, new SourceInfo("manual", null), null);
  }

  private UUID defineObject(String code, String name, String parentCode, Actor actor) {
    meta.defineObjectType(
        new DefineObjectTypeCommand(
            WORKSPACE, UUID.randomUUID(), "object-" + code, null, code, name, parentCode),
        actor);
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        WORKSPACE,
        code);
  }

  private UUID relationType(String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        WORKSPACE,
        code);
  }

  private void publish(UUID... typeIds) {
    for (var typeId : typeIds) {
      jdbc.update("UPDATE object_type SET published = TRUE WHERE id = ?", typeId);
    }
  }
}
