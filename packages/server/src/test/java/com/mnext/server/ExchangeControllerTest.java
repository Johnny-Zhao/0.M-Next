package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.JsonArtifact;
import com.mnext.engines.exchange.JsonArtifact.ArtifactObject;
import com.mnext.engines.exchange.JsonArtifact.ArtifactRelation;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.commands.ArchiveCommand;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.commands.SoftDeleteCommand;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ExchangeControllerTest {
  private static final UUID WORKSPACE = UUID.randomUUID();
  private static final UUID ONE = UUID.randomUUID();
  private static final UUID TWO = UUID.randomUUID();
  private static final UUID OBJECT_TYPE = UUID.randomUUID();
  private static final UUID RELATION_TYPE = UUID.randomUUID();
  private final ReadModelRepository readModel = mock(ReadModelRepository.class);
  private final KernelCommandService commands = mock(KernelCommandService.class);
  private final ObjectMapper mapper = new ObjectMapper();
  private final ExchangeController controller = new ExchangeController(readModel, commands, mapper);

  @BeforeEach
  void defaults() {
    when(readModel.objectTypeId(WORKSPACE, "demo")).thenReturn(OBJECT_TYPE);
    when(readModel.relationTypeId(WORKSPACE, "depends")).thenReturn(RELATION_TYPE);
    when(commands.createObject(any(), any())).thenReturn(committed("created"));
    when(commands.updateFields(any(), any())).thenReturn(committed());
    when(commands.createRelation(any(), any())).thenReturn(committed());
    when(readModel.createdObjectId(List.of("created"))).thenReturn(TWO);
  }

  @Test
  void exportsAndPreviewsWithoutCommands() throws Exception {
    var current = current();
    when(readModel.dataSet(WORKSPACE)).thenReturn(current);
    var exported = controller.export(WORKSPACE, "demo");
    var changed =
        new JsonArtifact(
            1,
            WORKSPACE.toString(),
            "demo",
            List.of(new ArtifactObject("demo", Map.of("value", 2), ONE.toString())),
            List.of());

    var preview = controller.preview(WORKSPACE, mapper.writeValueAsString(changed));

    assertEquals(ONE.toString(), exported.objects().getFirst().key());
    assertEquals(1, preview.summary().objectsChanged());
    verify(commands, never()).createObject(any(), any());
    verify(commands, never()).updateFields(any(), any());
    verify(commands, never()).createRelation(any(), any());
  }

  @Test
  void appliesAddedObjectChangedFieldAndAddedRelationThroughCommands() {
    when(readModel.dataSet(WORKSPACE)).thenReturn(current());

    var result =
        controller.apply(WORKSPACE, "actor", new ExchangeApplyRequest(importArtifact(), false));

    assertEquals(3, result.applied().size());
    assertTrue(result.unapplied().isEmpty());
    verifyCreateObject();
    verifyUpdateFields();
    verifyCreateRelation();
  }

  @Test
  void reportsFieldConflictAndNeverDeletesRemovedItems() {
    when(readModel.dataSet(WORKSPACE)).thenReturn(current());
    var error = new CommandError("KERNEL-409-VERSION-CONFLICT", "版本冲突", Map.of(), "刷新后重试");
    when(commands.updateFields(any(), any())).thenThrow(new CommandRejectedException(error));

    var result =
        controller.apply(WORKSPACE, "actor", new ExchangeApplyRequest(importArtifact(), false));

    assertEquals("KERNEL-409-VERSION-CONFLICT", result.unapplied().getFirst().error().code());
    verify(commands, never()).archive(any(ArchiveCommand.class), any());
    verify(commands, never()).softDelete(any(SoftDeleteCommand.class), any());
  }

  @Test
  void genericJsonPreviewAndApplyMatchExistingCommandFlow() throws Exception {
    when(readModel.dataSet(WORKSPACE)).thenReturn(current());
    var payload = mapper.writeValueAsString(importArtifact());

    var preview = controller.previewGeneric(WORKSPACE, "json", "current", payload);
    var result =
        controller.applyGeneric(
            WORKSPACE, "json", "actor", new GenericExchangeApplyRequest(payload, false));

    assertEquals(1, preview.summary().objectsAdded());
    assertEquals(3, result.applied().size());
    verifyCreateObject();
    verifyUpdateFields();
    verifyCreateRelation();
  }

  @Test
  void genericReqIfPreviewMatchesSpecificPathAndUnknownFormatIsRejected() {
    when(readModel.dataSet(WORKSPACE)).thenReturn(current());
    var reqif = controller.exportReqIf(WORKSPACE, "current", "demo");

    var generic = controller.previewGeneric(WORKSPACE, "reqif", "current", reqif);
    var specific = controller.previewReqIf(WORKSPACE, "current", reqif);
    var failure =
        assertThrows(
            IllegalArgumentException.class,
            () -> controller.previewGeneric(WORKSPACE, "missing", "current", reqif));

    assertEquals(specific.summary(), generic.summary());
    assertTrue(failure.getMessage().contains("KERNEL-400-SCHEMA-INVALID"));
  }

  private void verifyCreateObject() {
    var captured = ArgumentCaptor.forClass(CreateObjectCommand.class);
    verify(commands).createObject(captured.capture(), any());
    assertEquals(OBJECT_TYPE, captured.getValue().objectTypeId());
    assertEquals("artifact_sync", captured.getValue().source().type());
    assertEquals("import", captured.getValue().source().ref());
  }

  private void verifyUpdateFields() {
    var captured = ArgumentCaptor.forClass(UpdateFieldsCommand.class);
    verify(commands).updateFields(captured.capture(), any());
    assertEquals(ONE, captured.getValue().objectId());
    assertEquals(1L, captured.getValue().fields().getFirst().expectedFieldVersion());
    assertEquals(2, captured.getValue().fields().getFirst().value());
  }

  private void verifyCreateRelation() {
    var captured = ArgumentCaptor.forClass(CreateRelationCommand.class);
    verify(commands).createRelation(captured.capture(), any());
    assertEquals(RELATION_TYPE, captured.getValue().relationTypeId());
    assertEquals(ONE, captured.getValue().sourceId());
    assertEquals(TWO, captured.getValue().targetId());
  }

  private static DataSet current() {
    return new DataSet(
        List.of(new DataObject(ONE.toString(), "demo", Map.of("value", 1), "DRAFT", 1)), List.of());
  }

  private static JsonArtifact importArtifact() {
    return new JsonArtifact(
        1,
        WORKSPACE.toString(),
        "demo",
        List.of(
            new ArtifactObject("demo", Map.of("value", 2), ONE.toString()),
            new ArtifactObject("demo", Map.of("value", 3), "external-two")),
        List.of(
            new ArtifactRelation("depends", ONE.toString(), "external-two", Map.of("weight", 1))));
  }

  private static CommandResult committed(String... events) {
    return new CommandResult("command", CommandStatus.COMMITTED, false, List.of(events), null);
  }
}
