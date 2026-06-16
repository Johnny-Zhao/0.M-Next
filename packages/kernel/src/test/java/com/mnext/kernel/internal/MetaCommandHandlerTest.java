package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.DefineValueTypeCommand;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MetaCommandHandlerTest {
  private final UUID workspace = UUID.randomUUID();
  private final UUID type = UUID.randomUUID();
  private final MetaModelRepository meta = mock(MetaModelRepository.class);
  private final KernelRepository repository = mock(KernelRepository.class);
  private final PermissionChecker permissions = mock(PermissionChecker.class);

  @BeforeEach
  void writableWorkspace() {
    when(repository.workspaceWritable(workspace)).thenReturn(true);
    when(repository.findCommand(eq(workspace), any())).thenReturn(Optional.empty());
  }

  @Test
  void defineObjectTypeWritesAuditAndChecksPermission() {
    var command =
        new DefineObjectTypeCommand(
            workspace, UUID.randomUUID(), "meta-object", null, "requirement", "需求");

    new DefineObjectTypeHandler(meta, repository, permissions)
        .execute(command, Actor.user("author"));

    verify(permissions)
        .check("metamodel.define", workspace, null, java.util.Set.of(), Actor.user("author"));
    verify(meta)
        .insertObjectType(
            any(),
            eq(workspace),
            eq(null),
            eq("requirement"),
            eq("需求"),
            eq(null),
            eq("author"),
            any());
  }

  @Test
  void publishedTemplateVersionIsImmutable() {
    var version = UUID.randomUUID();
    when(meta.templateVersionStatus(version)).thenReturn(Optional.of("published"));
    var command =
        new DefineObjectTypeCommand(
            workspace, UUID.randomUUID(), "meta-published", version, "x", "X");

    assertCode(
        "KERNEL-409-TEMPLATE-VERSION-IMMUTABLE",
        () ->
            new DefineObjectTypeHandler(meta, repository, permissions)
                .execute(command, Actor.user("author")));
  }

  @Test
  void duplicateObjectTypeCodeIsRejected() {
    var existing = new MetaModelRepository.ObjectTypeRow(type, null, null, false);
    when(meta.objectTypeByCode(workspace, "duplicate")).thenReturn(Optional.of(existing));
    var command =
        new DefineObjectTypeCommand(
            workspace, UUID.randomUUID(), "meta-duplicate", null, "duplicate", "X");

    new DefineObjectTypeHandler(meta, repository, permissions)
        .execute(command, Actor.user("author"));

    verify(meta).updateObjectType(eq(type), eq("X"), eq(null), eq("author"), any());
  }

  @Test
  void objectGeneralizationCycleIsRejected() {
    var parent = UUID.randomUUID();
    when(meta.objectTypeByCode(workspace, "child"))
        .thenReturn(Optional.of(new MetaModelRepository.ObjectTypeRow(type, null, null, false)));
    when(meta.objectTypeByCode(workspace, "parent"))
        .thenReturn(Optional.of(new MetaModelRepository.ObjectTypeRow(parent, null, null, false)));
    when(meta.objectTypeDescendsFrom(workspace, parent, type)).thenReturn(true);
    var command =
        new DefineObjectTypeCommand(
            workspace, UUID.randomUUID(), "meta-cycle", null, "child", "Child", "parent");

    assertCode(
        "META-422-GENERALIZATION-CYCLE",
        () ->
            new DefineObjectTypeHandler(meta, repository, permissions)
                .execute(command, Actor.user("author")));
  }

  @Test
  void objectParentMustUseSameTemplateVersion() {
    var parent = UUID.randomUUID();
    var childTemplate = UUID.randomUUID();
    var parentTemplate = UUID.randomUUID();
    when(meta.templateVersionStatus(childTemplate)).thenReturn(Optional.of("draft"));
    when(meta.objectTypeByCode(workspace, "parent"))
        .thenReturn(
            Optional.of(
                new MetaModelRepository.ObjectTypeRow(parent, parentTemplate, null, false)));
    var command =
        new DefineObjectTypeCommand(
            workspace,
            UUID.randomUUID(),
            "meta-cross-template",
            childTemplate,
            "child",
            "Child",
            "parent");

    assertCode(
        "META-422-PARENT-CROSS-TEMPLATE",
        () ->
            new DefineObjectTypeHandler(meta, repository, permissions)
                .execute(command, Actor.user("author")));
  }

  @Test
  void valueTypeGeneralizationRulesAreRejected() {
    var parentId = UUID.randomUUID();
    var childId = UUID.randomUUID();
    var parent =
        new MetaModelRepository.ValueTypeRow(
            parentId, null, "short_text", DataType.TEXT, null, shortText(), false);
    when(meta.valueTypeByCode(workspace, "short_text")).thenReturn(Optional.of(parent));
    when(meta.resolveEffectiveValueType(parentId))
        .thenReturn(
            new MetaModelRepository.EffectiveValueType(parentId, DataType.TEXT, shortText()));
    when(meta.narrowingViolations(
            eq(workspace),
            eq(shortText()),
            eq(new FieldConstraints(null, 200, null, null, null, null, null))))
        .thenReturn(java.util.List.of("maxLength"));

    assertCode(
        "META-422-VALUETYPE-BASE-MISMATCH",
        () ->
            new DefineValueTypeHandler(meta, repository, permissions)
                .execute(
                    new DefineValueTypeCommand(
                        workspace,
                        UUID.randomUUID(),
                        "meta-base",
                        null,
                        "bad",
                        "Bad",
                        DataType.STRING,
                        "short_text",
                        FieldConstraints.empty()),
                    Actor.user("author")));

    assertCode(
        "META-422-REDEFINITION-INCONSISTENT",
        () ->
            new DefineValueTypeHandler(meta, repository, permissions)
                .execute(
                    new DefineValueTypeCommand(
                        workspace,
                        UUID.randomUUID(),
                        "meta-wide",
                        null,
                        "too_long",
                        "Too long",
                        DataType.TEXT,
                        "short_text",
                        new FieldConstraints(null, 200, null, null, null, null, null)),
                    Actor.user("author")));

    when(meta.valueTypeByCode(workspace, "paragraph"))
        .thenReturn(
            Optional.of(
                new MetaModelRepository.ValueTypeRow(
                    childId,
                    null,
                    "paragraph",
                    DataType.TEXT,
                    parentId,
                    FieldConstraints.empty(),
                    false)));
    when(meta.valueTypeDescendsFrom(parentId, childId)).thenReturn(true);
    assertCode(
        "META-422-GENERALIZATION-CYCLE",
        () ->
            new DefineValueTypeHandler(meta, repository, permissions)
                .execute(
                    new DefineValueTypeCommand(
                        workspace,
                        UUID.randomUUID(),
                        "meta-value-cycle",
                        null,
                        "paragraph",
                        "Paragraph",
                        DataType.TEXT,
                        "short_text",
                        FieldConstraints.empty()),
                    Actor.user("author")));
  }

  @Test
  void publishedValueTypeIsImmutable() {
    when(meta.valueTypeByCode(workspace, "text"))
        .thenReturn(
            Optional.of(
                new MetaModelRepository.ValueTypeRow(
                    type, null, "text", DataType.TEXT, null, FieldConstraints.empty(), true)));

    assertCode(
        "META-409-PUBLISHED-IMMUTABLE",
        () ->
            new DefineValueTypeHandler(meta, repository, permissions)
                .execute(
                    new DefineValueTypeCommand(
                        workspace,
                        UUID.randomUUID(),
                        "meta-published-value",
                        null,
                        "text",
                        "Text",
                        DataType.TEXT,
                        null,
                        FieldConstraints.empty()),
                    Actor.user("author")));
  }

  @Test
  void fieldConstraintsRejectEnumRefAndRange() {
    when(meta.objectTypeTemplateVersion(workspace, type)).thenReturn(Optional.empty());
    assertFieldConstraint(DataType.ENUM, FieldConstraints.empty());
    assertFieldConstraint(
        DataType.REF, new FieldConstraints(null, null, null, null, null, null, "missing_type"));
    assertFieldConstraint(
        DataType.NUMBER,
        new FieldConstraints(null, null, BigDecimal.TEN, BigDecimal.ONE, null, null, null));
  }

  @Test
  void dangerousPatternIsRejected() {
    assertFieldConstraint(
        DataType.STRING, new FieldConstraints(null, null, null, null, "(a+)+", null, null));
  }

  @Test
  void hierarchicalRelationMustBeOneToMany() {
    when(meta.objectTypeExists(workspace, type)).thenReturn(true);
    var command =
        new DefineRelationTypeCommand(
            workspace,
            UUID.randomUUID(),
            "meta-relation",
            "decomposes",
            "分解",
            type,
            type,
            "directed",
            "many_to_many",
            "strong",
            true);

    assertCode(
        "KERNEL-422-FIELD-CONSTRAINT-INVALID",
        () ->
            new DefineRelationTypeHandler(meta, repository, permissions)
                .execute(command, Actor.user("author")));
  }

  private void assertFieldConstraint(DataType dataType, FieldConstraints constraints) {
    var command =
        new DefineFieldDefCommand(
            workspace,
            UUID.randomUUID(),
            "meta-field-" + dataType.code(),
            type,
            "budget",
            "预算",
            dataType,
            false,
            constraints);

    assertCode(
        "KERNEL-422-FIELD-CONSTRAINT-INVALID",
        () ->
            new DefineFieldDefHandler(meta, repository, permissions)
                .execute(command, Actor.user("author")));
  }

  private static void assertCode(String code, Runnable action) {
    var error = assertThrows(CommandRejectedException.class, action::run);
    assertEquals(code, error.error().code());
  }

  private static FieldConstraints shortText() {
    return new FieldConstraints(null, 100, null, null, null, null, null);
  }
}
