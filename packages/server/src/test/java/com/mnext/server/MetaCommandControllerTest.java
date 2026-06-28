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
  private final TemplateLifecycleService lifecycle = mock(TemplateLifecycleService.class);
  private final DerivedFieldRepository derivedFields = mock(DerivedFieldRepository.class);
  private final ObjectMapper mapper = new ObjectMapper();
  private final MetaCommandController controller =
      new MetaCommandController(commands, lifecycle, derivedFields, mapper);

  @Test
  void routesCreateTemplateOnSeparateEndpointController() throws Exception {
    var workspace = UUID.randomUUID();
    var request =
        new CommandRequest(
            "CreateTemplate",
            workspace,
            UUID.randomUUID(),
            "meta-create-template",
            mapper.readTree("{\"code\":\"api_template\",\"name\":\"API 模板\"}"));
    when(commands.createTemplate(any(), any()))
        .thenReturn(new CommandResult("command", CommandStatus.COMMITTED, false, List.of(), null));

    var result = controller.execute(workspace, "author", request);

    assertEquals("command", result.commandId());
    verify(commands).createTemplate(any(), eq(com.mnext.kernel.api.Actor.user("author")));
  }

  @Test
  void routesCreateTemplateVersionOnSeparateEndpointController() throws Exception {
    var workspace = UUID.randomUUID();
    var template = UUID.randomUUID();
    var request =
        new CommandRequest(
            "CreateTemplateVersion",
            workspace,
            UUID.randomUUID(),
            "meta-create-template-version",
            mapper.readTree("{\"templateId\":\"" + template + "\"}"));
    when(commands.createTemplateVersion(any(), any()))
        .thenReturn(new CommandResult("command", CommandStatus.COMMITTED, false, List.of(), null));

    var result = controller.execute(workspace, "author", request);

    assertEquals("command", result.commandId());
    verify(commands).createTemplateVersion(any(), eq(com.mnext.kernel.api.Actor.user("author")));
  }

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
  void routesDefineValueTypeOnSeparateEndpointController() throws Exception {
    var workspace = UUID.randomUUID();
    var request =
        new CommandRequest(
            "DefineValueType",
            workspace,
            UUID.randomUUID(),
            "meta-value-type",
            mapper.readTree(
                "{\"code\":\"paragraph\",\"name\":\"自然段\","
                    + "\"basePrimitive\":\"text\",\"parentValueTypeCode\":\"text\"}"));
    when(commands.defineValueType(any(), any()))
        .thenReturn(new CommandResult("command", CommandStatus.COMMITTED, false, List.of(), null));

    var result = controller.execute(workspace, "author", request);

    assertEquals("command", result.commandId());
    verify(commands).defineValueType(any(), eq(com.mnext.kernel.api.Actor.user("author")));
  }

  @Test
  void routesPublishTemplateVersionOnSeparateEndpointController() throws Exception {
    var workspace = UUID.randomUUID();
    var version = UUID.randomUUID();
    var request =
        new CommandRequest(
            "PublishTemplateVersion",
            workspace,
            UUID.randomUUID(),
            "meta-publish",
            mapper.readTree("{\"templateVersionId\":\"" + version + "\"}"));
    when(commands.publishTemplateVersion(any(), any()))
        .thenReturn(new CommandResult("command", CommandStatus.COMMITTED, false, List.of(), null));

    var result = controller.execute(workspace, "author", request);

    assertEquals("command", result.commandId());
    verify(commands).publishTemplateVersion(any(), eq(com.mnext.kernel.api.Actor.user("author")));
  }

  @Test
  void routesInstantiateWorkspaceOnSeparateEndpointController() throws Exception {
    var workspace = UUID.randomUUID();
    var template = UUID.randomUUID();
    var newWorkspace = UUID.randomUUID();
    var request =
        new CommandRequest(
            "InstantiateWorkspace",
            workspace,
            UUID.randomUUID(),
            "meta-instantiate",
            mapper.readTree(
                "{\"templateId\":\""
                    + template
                    + "\",\"version\":1,\"newWorkspaceId\":\""
                    + newWorkspace
                    + "\",\"workspaceName\":\"实例\"}"));
    when(lifecycle.instantiateWorkspace(any(), any()))
        .thenReturn(new CommandResult("command", CommandStatus.COMMITTED, false, List.of(), null));

    var result = controller.execute(workspace, "author", request);

    assertEquals("command", result.commandId());
    verify(lifecycle).instantiateWorkspace(any(), eq(com.mnext.kernel.api.Actor.user("author")));
  }

  @Test
  void routesApplyTemplateVersionOnSeparateEndpointController() throws Exception {
    var workspace = UUID.randomUUID();
    var request =
        new CommandRequest(
            "ApplyTemplateVersion",
            workspace,
            UUID.randomUUID(),
            "meta-apply",
            mapper.readTree("{\"toVersion\":2}"));
    when(lifecycle.applyTemplateVersion(any(), any()))
        .thenReturn(new CommandResult("command", CommandStatus.COMMITTED, false, List.of(), null));

    var result = controller.execute(workspace, "author", request);

    assertEquals("command", result.commandId());
    verify(lifecycle).applyTemplateVersion(any(), eq(com.mnext.kernel.api.Actor.user("author")));
  }

  @Test
  void routesApplyProfileOnSeparateEndpointController() throws Exception {
    var workspace = UUID.randomUUID();
    var template = UUID.randomUUID();
    var request =
        new CommandRequest(
            "ApplyProfile",
            workspace,
            UUID.randomUUID(),
            "meta-apply-profile",
            mapper.readTree("{\"templateId\":\"" + template + "\",\"version\":1}"));
    when(lifecycle.applyProfile(any(), any()))
        .thenReturn(new CommandResult("command", CommandStatus.COMMITTED, false, List.of(), null));

    var result = controller.execute(workspace, "author", request);

    assertEquals("command", result.commandId());
    verify(lifecycle).applyProfile(any(), eq(com.mnext.kernel.api.Actor.user("author")));
  }

  @Test
  void routesDefineDerivedFieldOnSeparateEndpointController() throws Exception {
    var workspace = UUID.randomUUID();
    var type = UUID.randomUUID();
    var request =
        new CommandRequest(
            "DefineDerivedField",
            workspace,
            UUID.randomUUID(),
            "meta-derived",
            mapper.readTree(
                "{\"objectTypeId\":\""
                    + type
                    + "\",\"code\":\"total_load\",\"name\":\"总负载\","
                    + "\"resultType\":\"number\",\"derivation\":\"sum(traverse('carries','out'),'load')\"}"));
    when(derivedFields.define(any(), eq("author")))
        .thenReturn(new CommandResult("command", CommandStatus.ACCEPTED, false, List.of(), null));

    var result = controller.execute(workspace, "author", request);

    assertEquals("command", result.commandId());
    verify(derivedFields).define(any(), eq("author"));
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
