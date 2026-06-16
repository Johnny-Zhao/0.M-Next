package com.mnext.kernel.internal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CreateObjectHandlerTest {
  @Test
  void invokesPermissionCheckerBeforeWriting() {
    var repository = mock(KernelRepository.class);
    var meta = mock(MetaModelRepository.class);
    var permission = mock(PermissionChecker.class);
    var workspaceId = UUID.randomUUID();
    var typeId = UUID.randomUUID();
    var fieldId = UUID.randomUUID();
    var command =
        new CreateObjectCommand(
            workspaceId,
            UUID.randomUUID(),
            "ck-permission",
            typeId,
            Map.of("name", "demo"),
            new SourceInfo("manual", null),
            null);
    when(repository.workspaceWritable(workspaceId)).thenReturn(true);
    when(repository.findCommand(eq(workspaceId), any())).thenReturn(Optional.empty());
    when(repository.objectTypePublished(workspaceId, typeId)).thenReturn(true);
    var definitions = new LinkedHashMap<String, FieldDefinition>();
    definitions.put("name", new FieldDefinition(fieldId, "name", true));
    when(meta.resolveEffectiveFields(typeId)).thenReturn(definitions);

    new CreateObjectHandler(repository, meta, permission).execute(command, Actor.user("actor-1"));

    verify(permission)
        .check("object.create", workspaceId, typeId, Set.of("name"), Actor.user("actor-1"));
    verify(repository)
        .insertObject(any(), eq(workspaceId), eq(typeId), eq("DRAFT"), eq("actor-1"), any());
  }
}
