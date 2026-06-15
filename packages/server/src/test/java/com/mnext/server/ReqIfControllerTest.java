package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.reqif.ReqIfCodec;
import com.mnext.engines.exchange.reqif.ReqIfMapper;
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

class ReqIfControllerTest {
  private static final UUID WORKSPACE = UUID.randomUUID();
  private static final UUID ONE = UUID.randomUUID();
  private static final UUID TWO = UUID.randomUUID();
  private static final UUID OBJECT_TYPE = UUID.randomUUID();
  private static final UUID RELATION_TYPE = UUID.randomUUID();
  private final ReadModelRepository readModel = mock(ReadModelRepository.class);
  private final KernelCommandService commands = mock(KernelCommandService.class);
  private final ExchangeController controller =
      new ExchangeController(readModel, commands, new ObjectMapper());
  private final ReqIfCodec codec = new ReqIfCodec();

  @BeforeEach
  void defaults() {
    when(readModel.objectTypeId(WORKSPACE, "Requirement")).thenReturn(OBJECT_TYPE);
    when(readModel.relationTypeId(WORKSPACE, "relates")).thenReturn(RELATION_TYPE);
    when(commands.createObject(any(), any())).thenReturn(committed("created"));
    when(commands.updateFields(any(), any())).thenReturn(committed());
    when(commands.createRelation(any(), any())).thenReturn(committed());
    when(readModel.createdObjectId(List.of("created"))).thenReturn(TWO);
  }

  @Test
  void exportsAndPreviewsReqIfWithoutCommands() {
    when(readModel.dataSet(WORKSPACE)).thenReturn(current());

    var xml = controller.exportReqIf(WORKSPACE, "current", "Requirement");
    var preview = controller.previewReqIf(WORKSPACE, "current", targetReqIf());

    assertTrue(xml.contains("SPEC-OBJECT"));
    assertEquals(1, preview.summary().objectsAdded());
    assertEquals(1, preview.summary().objectsChanged());
    assertEquals(1, preview.summary().relationsAdded());
    verify(commands, never()).createObject(any(), any());
    verify(commands, never()).updateFields(any(), any());
    verify(commands, never()).createRelation(any(), any());
  }

  @Test
  void appliesReqIfThroughM1Commands() {
    when(readModel.dataSet(WORKSPACE)).thenReturn(current());

    var result =
        controller.applyReqIf(WORKSPACE, "actor", new ReqIfApplyRequest(targetReqIf(), false));

    assertEquals(3, result.applied().size());
    assertTrue(result.unapplied().isEmpty());
    verifyCreateObject();
    verifyUpdateFields();
    verifyCreateRelation();
  }

  @Test
  void reportsConflictAndNeverDeletesRemovedReqIfItems() {
    when(readModel.dataSet(WORKSPACE)).thenReturn(current());
    var error = new CommandError("KERNEL-409-VERSION-CONFLICT", "版本冲突", Map.of(), "刷新后重试");
    when(commands.updateFields(any(), any())).thenThrow(new CommandRejectedException(error));

    var result =
        controller.applyReqIf(WORKSPACE, "actor", new ReqIfApplyRequest(targetReqIf(), false));

    assertEquals("KERNEL-409-VERSION-CONFLICT", result.unapplied().getFirst().error().code());
    verify(commands, never()).archive(any(ArchiveCommand.class), any());
    verify(commands, never()).softDelete(any(SoftDeleteCommand.class), any());
  }

  private void verifyCreateObject() {
    var captured = ArgumentCaptor.forClass(CreateObjectCommand.class);
    verify(commands).createObject(captured.capture(), any());
    assertEquals(OBJECT_TYPE, captured.getValue().objectTypeId());
    assertEquals("artifact_sync", captured.getValue().source().type());
  }

  private void verifyUpdateFields() {
    var captured = ArgumentCaptor.forClass(UpdateFieldsCommand.class);
    verify(commands).updateFields(captured.capture(), any());
    assertEquals(ONE, captured.getValue().objectId());
    assertEquals(1L, captured.getValue().fields().getFirst().expectedFieldVersion());
    assertEquals("Changed", captured.getValue().fields().getFirst().value());
  }

  private void verifyCreateRelation() {
    var captured = ArgumentCaptor.forClass(CreateRelationCommand.class);
    verify(commands).createRelation(captured.capture(), any());
    assertEquals(RELATION_TYPE, captured.getValue().relationTypeId());
    assertEquals(ONE, captured.getValue().sourceId());
    assertEquals(TWO, captured.getValue().targetId());
  }

  private String targetReqIf() {
    return codec.serialize(ReqIfMapper.toReqIf("target", null, target()));
  }

  private static DataSet current() {
    return new DataSet(
        List.of(new DataObject(ONE.toString(), "Requirement", Map.of("title", "One"), "DRAFT", 1)),
        List.of());
  }

  private static DataSet target() {
    return new DataSet(
        List.of(
            new DataObject(ONE.toString(), "Requirement", Map.of("title", "Changed"), "DRAFT", 1),
            new DataObject("REQ-2", "Requirement", Map.of("title", "Two"), "DRAFT", 1)),
        List.of(new DataRelation("rel-1", "relates", ONE.toString(), "REQ-2", Map.of())));
  }

  private static CommandResult committed(String... events) {
    return new CommandResult("command", CommandStatus.COMMITTED, false, List.of(events), null);
  }
}
