package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.metamodel.CreateTemplateCommand;
import com.mnext.kernel.api.metamodel.CreateTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import com.mnext.kernel.api.metamodel.PublishTemplateVersionCommand;
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
@SpringBootTest(classes = TemplateCreationIntegrationTest.TestApplication.class)
class TemplateCreationIntegrationTest {
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
  void createsPublishesAndInstantiatesTemplateThroughApiCommands() {
    var actor = Actor.user("template-author");
    var code = "tpl_api_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    var template =
        meta.createTemplate(
            new CreateTemplateCommand(WORKSPACE, UUID.randomUUID(), "create-" + code, code, "模板"),
            actor);
    var templateId = returnedUuid(template, "templateId");
    var secondVersion =
        meta.createTemplateVersion(
            new CreateTemplateVersionCommand(
                WORKSPACE, UUID.randomUUID(), "create-version-" + code, templateId),
            actor);
    var versionId = returnedUuid(secondVersion, "templateVersionId");

    meta.defineObjectType(
        new DefineObjectTypeCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "object-root-" + code,
            versionId,
            "api_root_" + code,
            "根"),
        actor);
    var root = objectType("api_root_" + code);
    meta.defineFieldDef(
        new DefineFieldDefCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "field-name-" + code,
            root,
            "name",
            "名称",
            DataType.STRING,
            true,
            FieldConstraints.empty()),
        actor);
    meta.defineObjectType(
        new DefineObjectTypeCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "object-child-" + code,
            versionId,
            "api_child_" + code,
            "子",
            "api_root_" + code),
        actor);
    var child = objectType("api_child_" + code);
    meta.defineRelationType(
        new DefineRelationTypeCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "relation-" + code,
            "api_rel_" + code,
            "关联",
            root,
            child,
            "directed",
            "many_to_many",
            "weak",
            false,
            versionId),
        actor);
    meta.publishTemplateVersion(
        new PublishTemplateVersionCommand(
            WORKSPACE, UUID.randomUUID(), "publish-" + code, versionId),
        actor);

    var newWorkspace = UUID.randomUUID();
    meta.instantiateWorkspace(
        new InstantiateWorkspaceCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "instantiate-" + code,
            templateId,
            2,
            newWorkspace,
            "模板实例"),
        actor);
    commands.createObject(
        new CreateObjectCommand(
            newWorkspace,
            UUID.randomUUID(),
            "object-instance-" + code,
            runtimeType(newWorkspace, "api_child_" + code),
            Map.of("name", "ok"),
            new SourceInfo("manual", null),
            null),
        actor);

    assertEquals(
        versionId,
        jdbc.queryForObject(
            "SELECT template_version_id FROM relation_type WHERE workspace_id = ? AND code = ?",
            UUID.class,
            WORKSPACE,
            "api_rel_" + code));
    assertEquals(
        1L,
        jdbc.queryForObject(
            "SELECT count(*) FROM data_object WHERE workspace_id = ?", Long.class, newWorkspace));
  }

  private UUID returnedUuid(CommandResult result, String name) {
    var prefix = name + "=";
    return result.events().stream()
        .filter(value -> value.startsWith(prefix))
        .map(value -> UUID.fromString(value.substring(prefix.length())))
        .findFirst()
        .orElseThrow();
  }

  private UUID objectType(String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        WORKSPACE,
        code);
  }

  private UUID runtimeType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }
}
