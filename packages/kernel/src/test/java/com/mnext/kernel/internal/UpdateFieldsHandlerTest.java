package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.RuleChecker;
import com.mnext.kernel.api.RuleViolation;
import com.mnext.kernel.api.commands.FieldUpdate;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class UpdateFieldsHandlerTest {
  @Test
  void invokesFieldPermissionChecker() {
    var repository = mock(KernelRepository.class);
    var meta = mock(MetaModelRepository.class);
    var permission = mock(PermissionChecker.class);
    var rules = mock(RuleChecker.class);
    var workspaceId = UUID.randomUUID();
    var objectId = UUID.randomUUID();
    var typeId = UUID.randomUUID();
    var fieldId = UUID.randomUUID();
    var command =
        new UpdateFieldsCommand(
            workspaceId,
            UUID.randomUUID(),
            "ck-update-permission",
            objectId,
            1,
            List.of(new FieldUpdate("name", "same", 1L)));
    var current = new FieldValueRow(fieldId, "name", "\"same\"", 1, "actor", Instant.now());
    when(repository.workspaceWritable(workspaceId)).thenReturn(true);
    when(repository.findCommand(eq(workspaceId), any())).thenReturn(Optional.empty());
    when(repository.lockObject(workspaceId, objectId))
        .thenReturn(Optional.of(new ObjectRow(objectId, typeId, "DRAFT", 1, "creator")));
    var definitions = new LinkedHashMap<String, FieldDefinition>();
    definitions.put("name", new FieldDefinition(fieldId, "name", true));
    when(meta.resolveEffectiveFields(typeId)).thenReturn(definitions);
    when(repository.lockField(objectId, "name")).thenReturn(Optional.of(current));
    when(repository.sameJson("\"same\"", "\"same\"")).thenReturn(true);
    when(rules.check(eq(workspaceId), eq(typeId), any(), eq(Actor.user("actor-1"))))
        .thenReturn(List.of());

    new UpdateFieldsHandler(repository, meta, permission, rules)
        .execute(command, Actor.user("actor-1"));

    verify(permission)
        .check("field.update", workspaceId, objectId, Set.of("name"), Actor.user("actor-1"));
  }

  @Test
  void rejectsBlockingRuleBeforeApplyingField() {
    var repository = mock(KernelRepository.class);
    var meta = mock(MetaModelRepository.class);
    var permission = mock(PermissionChecker.class);
    var rules = mock(RuleChecker.class);
    var workspaceId = UUID.randomUUID();
    var objectId = UUID.randomUUID();
    var typeId = UUID.randomUUID();
    var fieldId = UUID.randomUUID();
    var command =
        new UpdateFieldsCommand(
            workspaceId,
            UUID.randomUUID(),
            "ck-update-rule-block",
            objectId,
            1,
            List.of(new FieldUpdate("name", "bad", 1L)));
    var current = new FieldValueRow(fieldId, "name", "\"old\"", 1, "actor", Instant.now());
    when(repository.workspaceWritable(workspaceId)).thenReturn(true);
    when(repository.findCommand(eq(workspaceId), any())).thenReturn(Optional.empty());
    when(repository.lockObject(workspaceId, objectId))
        .thenReturn(Optional.of(new ObjectRow(objectId, typeId, "DRAFT", 1, "creator")));
    var definitions = new LinkedHashMap<String, FieldDefinition>();
    definitions.put("name", new FieldDefinition(fieldId, "name", true));
    when(meta.resolveEffectiveFields(typeId)).thenReturn(definitions);
    when(repository.lockField(objectId, "name")).thenReturn(Optional.of(current));
    when(rules.check(eq(workspaceId), eq(typeId), any(), eq(Actor.user("actor-1"))))
        .thenReturn(List.of(new RuleViolation("blocked-name", "BLOCK", "bad name")));

    var rejected =
        assertThrows(
            CommandRejectedException.class,
            () ->
                new UpdateFieldsHandler(repository, meta, permission, rules)
                    .execute(command, Actor.user("actor-1")));

    assertEquals("RULE-422-RULE-VIOLATION", rejected.error().code());
    verify(repository, never()).updateField(any(), any(), any(), anyLong(), any(), any());
    verify(repository, never()).incrementObjectVersion(any(), any(), any());
  }
}
