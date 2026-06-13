package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import com.mnext.kernel.api.MetaCommandService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MetaCommandControllerTest {
  private final MetaCommandService commands = mock(MetaCommandService.class);
  private final ObjectMapper mapper = new ObjectMapper();
  private final MetaCommandController controller = new MetaCommandController(commands, mapper);

  @Test
  void routesDefineObjectTypeOnSeparateEndpointController() throws Exception {
    var workspace = UUID.randomUUID();
    var request =
        new CommandRequest(
            "DefineObjectType",
            workspace,
            UUID.randomUUID(),
            "meta-controller",
            mapper.readTree("{\"code\":\"requirement\",\"name\":\"需求\"}"));
    when(commands.defineObjectType(any(), any()))
        .thenReturn(new CommandResult("command", CommandStatus.COMMITTED, false, List.of(), null));

    var result = controller.execute(workspace, "author", request);

    assertEquals("command", result.commandId());
    verify(commands).defineObjectType(any(), eq(com.mnext.kernel.api.Actor.user("author")));
  }

  @Test
  void rejectsUnknownDataTypeAsSchemaError() throws Exception {
    var workspace = UUID.randomUUID();
    var request =
        new CommandRequest(
            "DefineFieldDef",
            workspace,
            UUID.randomUUID(),
            "meta-bad-type",
            mapper.readTree(
                "{\"objectTypeId\":\"11111111-1111-4111-8111-111111111111\","
                    + "\"code\":\"value\",\"name\":\"值\",\"dataType\":\"money\"}"));

    var error =
        assertThrows(
            CommandRejectedException.class, () -> controller.execute(workspace, "author", request));

    assertEquals("KERNEL-400-SCHEMA-INVALID", error.error().code());
  }
}
