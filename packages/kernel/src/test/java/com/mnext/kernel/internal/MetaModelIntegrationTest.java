package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import java.math.BigDecimal;
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

  private static CreateObjectCommand create(UUID typeId, String key, Object budget) {
    return new CreateObjectCommand(
        WORKSPACE,
        UUID.randomUUID(),
        key,
        typeId,
        Map.of("budget", budget),
        new SourceInfo("manual", null),
        null);
  }
}
