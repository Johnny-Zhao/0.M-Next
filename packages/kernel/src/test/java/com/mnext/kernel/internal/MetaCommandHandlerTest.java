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
            any(), eq(workspace), eq(null), eq("requirement"), eq("需求"), eq("author"), any());
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
    when(meta.objectTypeCodeExists(workspace, "duplicate")).thenReturn(true);
    var command =
        new DefineObjectTypeCommand(
            workspace, UUID.randomUUID(), "meta-duplicate", null, "duplicate", "X");

    assertCode(
        "KERNEL-400-SCHEMA-INVALID",
        () ->
            new DefineObjectTypeHandler(meta, repository, permissions)
                .execute(command, Actor.user("author")));
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
}
