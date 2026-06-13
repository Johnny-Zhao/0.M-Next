package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.commands.SoftDeleteCommand;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SoftDeleteHandlerTest {
  @Test
  void nonDraftCreatorStillRequiresAdminPermission() {
    var repository = mock(KernelRepository.class);
    var relations = mock(RelationRepository.class);
    var permission = mock(PermissionChecker.class);
    var workspace = UUID.randomUUID();
    var target = UUID.randomUUID();
    var actor = Actor.user("creator");
    when(repository.workspaceWritable(workspace)).thenReturn(true);
    when(repository.findCommand(any(), any())).thenReturn(Optional.empty());
    when(repository.lockObject(workspace, target))
        .thenReturn(
            Optional.of(new ObjectRow(target, UUID.randomUUID(), "CONFIRMED", 1, "creator")));
    var denied =
        new CommandRejectedException(
            new CommandError("PERM-403-FIELD-DENIED", "拒绝", Map.of(), "申请管理员权限"));
    doThrow(denied).when(permission).check("admin.softdelete", workspace, target, Set.of(), actor);
    var archive = new ArchiveHandler(repository, relations, mock(UnlinkHandler.class), permission);
    var handler = new SoftDeleteHandler(repository, relations, archive, permission);
    var command =
        new SoftDeleteCommand(
            workspace, UUID.randomUUID(), "soft-delete", "object", target, "reason", 1, "reject");

    var error = assertThrows(CommandRejectedException.class, () -> handler.execute(command, actor));

    assertEquals("PERM-403-FIELD-DENIED", error.error().code());
    verify(permission).check("softdelete.execute", workspace, target, Set.of(), actor);
    verify(permission).check("admin.softdelete", workspace, target, Set.of(), actor);
  }
}
