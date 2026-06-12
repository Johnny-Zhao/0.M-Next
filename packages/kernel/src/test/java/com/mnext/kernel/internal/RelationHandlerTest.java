package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.commands.UnlinkCommand;
import com.mnext.kernel.api.commands.UpdateRelationCommand;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RelationHandlerTest {
  private static final UUID WORKSPACE = UUID.randomUUID();
  private static final UUID TYPE = UUID.randomUUID();

  @Test
  void createChecksPermissionBeforeSchemaRejection() {
    var fixture = fixture();
    var command =
        new CreateRelationCommand(
            WORKSPACE,
            UUID.randomUUID(),
            "create",
            TYPE,
            null,
            UUID.randomUUID(),
            Map.of(),
            new SourceInfo("manual", null));

    var error =
        assertThrows(
            CommandRejectedException.class,
            () -> fixture.create().execute(command, Actor.user("actor")));

    assertEquals("KERNEL-400-SCHEMA-INVALID", error.error().code());
    verify(fixture.permission())
        .check("relation.create", WORKSPACE, TYPE, Set.of(), Actor.user("actor"));
  }

  @Test
  void updateChecksPermissionBeforeSchemaRejection() {
    var fixture = fixture();
    var command =
        new UpdateRelationCommand(
            WORKSPACE, UUID.randomUUID(), "update", null, 1, Map.of("weight", 2), null, null);

    var error =
        assertThrows(
            CommandRejectedException.class,
            () -> fixture.update().execute(command, Actor.user("actor")));

    assertEquals("KERNEL-400-SCHEMA-INVALID", error.error().code());
    verify(fixture.permission())
        .check("relation.update", WORKSPACE, null, Set.of("weight"), Actor.user("actor"));
  }

  @Test
  void unlinkChecksPermissionBeforeSchemaRejection() {
    var fixture = fixture();
    var command =
        new UnlinkCommand(
            WORKSPACE, UUID.randomUUID(), "unlink", null, null, null, null, "reason", 1, false);

    var error =
        assertThrows(
            CommandRejectedException.class,
            () -> fixture.unlink().execute(command, Actor.user("actor")));

    assertEquals("KERNEL-400-SCHEMA-INVALID", error.error().code());
    verify(fixture.permission())
        .check("relation.unlink", WORKSPACE, null, Set.of(), Actor.user("actor"));
  }

  private Fixture fixture() {
    var repository = mock(KernelRepository.class);
    var relations = mock(RelationRepository.class);
    var permission = mock(PermissionChecker.class);
    when(repository.workspaceWritable(any())).thenReturn(true);
    return new Fixture(
        new CreateRelationHandler(repository, relations, permission),
        new UpdateRelationHandler(repository, relations, permission),
        new UnlinkHandler(repository, relations, permission),
        permission);
  }

  private record Fixture(
      CreateRelationHandler create,
      UpdateRelationHandler update,
      UnlinkHandler unlink,
      PermissionChecker permission) {}
}
