package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.BatchItemResult;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.commands.ArchiveCommand;
import com.mnext.kernel.api.commands.BatchCommand;
import com.mnext.kernel.api.commands.BatchItem;
import com.mnext.kernel.api.commands.ChangeStateCommand;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.commands.SoftDeleteCommand;
import com.mnext.kernel.api.commands.UnlinkCommand;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import com.mnext.kernel.api.commands.UpdateRelationCommand;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
class BatchCommandHandler {
  private final KernelRepository repository;
  private final PermissionChecker permissionChecker;
  private final CommandSupport support;
  private final CreateObjectHandler createObject;
  private final UpdateFieldsHandler updateFields;
  private final ChangeStateHandler changeState;
  private final CreateRelationHandler createRelation;
  private final UpdateRelationHandler updateRelation;
  private final ArchiveHandler archive;
  private final UnlinkHandler unlink;
  private final SoftDeleteHandler softDelete;
  private final TransactionTemplate transactions;

  BatchCommandHandler(
      KernelRepository repository,
      PermissionChecker permissionChecker,
      CreateObjectHandler createObject,
      UpdateFieldsHandler updateFields,
      ChangeStateHandler changeState,
      CreateRelationHandler createRelation,
      UpdateRelationHandler updateRelation,
      ArchiveHandler archive,
      UnlinkHandler unlink,
      SoftDeleteHandler softDelete,
      PlatformTransactionManager transactionManager) {
    this.repository = repository;
    this.permissionChecker = permissionChecker;
    this.support = new CommandSupport(repository);
    this.createObject = createObject;
    this.updateFields = updateFields;
    this.changeState = changeState;
    this.createRelation = createRelation;
    this.updateRelation = updateRelation;
    this.archive = archive;
    this.unlink = unlink;
    this.softDelete = softDelete;
    this.transactions = new TransactionTemplate(transactionManager);
  }

  CommandResult execute(BatchCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissionChecker.check(
        "batch.execute", command.workspaceId(), command.workspaceId(), Set.of(), actor);
    validate(command);
    var payloadHash = CommandSupport.payloadHash(payload(command));
    var stored = repository.findCommand(command.workspaceId(), command.idempotencyKey());
    if (stored.isPresent() && !stored.get().payloadHash().equals(payloadHash)) {
      throw CommandErrors.idempotency(stored.get().commandId());
    }
    if (stored.isPresent() && "all_or_nothing".equals(command.transactionMode())) {
      return support
          .replay(command.workspaceId(), command.idempotencyKey(), payloadHash)
          .orElseThrow();
    }
    var commandId = stored.map(StoredCommand::commandId).orElseGet(CommandSupport::commandId);
    return "all_or_nothing".equals(command.transactionMode())
        ? transactions.execute(status -> executeAll(command, actor, payloadHash, commandId))
        : executePartial(command, actor, payloadHash, commandId);
  }

  private CommandResult executeAll(
      BatchCommand command, Actor actor, String payloadHash, String commandId) {
    var results = new ArrayList<BatchItemResult>();
    for (var index = 0; index < command.commands().size(); index++) {
      results.add(run(command.commands().get(index), actor, commandId, index));
    }
    return complete(command, actor, payloadHash, commandId, results);
  }

  private CommandResult executePartial(
      BatchCommand command, Actor actor, String payloadHash, String commandId) {
    var results = new ArrayList<BatchItemResult>();
    for (var index = 0; index < command.commands().size(); index++) {
      try {
        results.add(run(command.commands().get(index), actor, commandId, index));
      } catch (CommandRejectedException error) {
        results.add(new BatchItemResult(index, CommandStatus.REJECTED, error.error(), List.of()));
      }
    }
    return transactions.execute(
        status -> complete(command, actor, payloadHash, commandId, results));
  }

  private BatchItemResult run(BatchItem item, Actor actor, String commandId, int index) {
    CommandSupport.batchCausation(commandId);
    try {
      var result =
          switch (item.commandType()) {
            case "CreateObject" ->
                createObject.execute((CreateObjectCommand) item.command(), actor);
            case "UpdateFields" ->
                updateFields.execute((UpdateFieldsCommand) item.command(), actor);
            case "ChangeState" -> changeState.execute((ChangeStateCommand) item.command(), actor);
            case "CreateRelation" ->
                createRelation.execute((CreateRelationCommand) item.command(), actor);
            case "UpdateRelation" ->
                updateRelation.execute((UpdateRelationCommand) item.command(), actor);
            case "Archive" -> archive.execute((ArchiveCommand) item.command(), actor);
            case "Unlink" -> unlink.execute((UnlinkCommand) item.command(), actor);
            case "SoftDelete" -> softDelete.execute((SoftDeleteCommand) item.command(), actor);
            case "BatchCommand" -> throw CommandErrors.nestedBatch();
            default -> throw CommandErrors.schema("未知子命令: " + item.commandType());
          };
      return new BatchItemResult(index, CommandStatus.COMMITTED, null, result.events());
    } finally {
      CommandSupport.clearBatchCausation();
    }
  }

  private CommandResult complete(
      BatchCommand command,
      Actor actor,
      String payloadHash,
      String commandId,
      List<BatchItemResult> results) {
    var now = Instant.now();
    var succeeded = results.stream().filter(r -> r.status() == CommandStatus.COMMITTED).toList();
    var failed = results.stream().filter(r -> r.status() == CommandStatus.REJECTED).toList();
    var summary = new LinkedHashMap<String, Object>();
    summary.put("succeeded", succeeded.size());
    summary.put("failed", failed.size());
    summary.put("succeededIndexes", succeeded.stream().map(BatchItemResult::index).toList());
    summary.put("failedIndexes", failed.stream().map(BatchItemResult::index).toList());
    var event =
        EventFactory.batchCommitted(
            command.workspaceId(),
            commandId,
            summary,
            actor,
            now,
            command.correlationId(),
            repository.nextEventSequence("batch", commandId));
    repository.insertEvent(event);
    var events = new ArrayList<String>();
    results.forEach(result -> events.addAll(result.events()));
    events.add(event.eventId());
    repository.upsertCommand(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "BatchCommand",
        payloadHash,
        events,
        now);
    return new CommandResult(
        commandId, CommandStatus.COMMITTED, false, events, null, List.copyOf(results));
  }

  private void validate(BatchCommand command) {
    if (command.commands() == null || command.commands().isEmpty()) {
      throw CommandErrors.schema("commands 必须为非空数组");
    }
    if (!Set.of("all_or_nothing", "partial").contains(command.transactionMode())) {
      throw CommandErrors.schema("transactionMode 仅允许 all_or_nothing 或 partial");
    }
    if (command.commands().stream().anyMatch(item -> "BatchCommand".equals(item.commandType()))) {
      throw CommandErrors.nestedBatch();
    }
    var writes = command.commands().stream().mapToLong(this::estimatedWrites).sum();
    if (command.commands().size() > 200 || writes > 2000) {
      throw CommandErrors.batchTooLarge(command.commands().size(), writes);
    }
  }

  private long estimatedWrites(BatchItem item) {
    if (item.command() instanceof CreateObjectCommand create) {
      return create.fields() == null ? 1 : 1L + create.fields().size();
    }
    if (item.command() instanceof UpdateFieldsCommand update) {
      return update.fields() == null ? 1 : update.fields().size();
    }
    return 1;
  }

  private Map<String, Object> payload(BatchCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("commands", command.commands());
    payload.put("transactionMode", command.transactionMode());
    if (command.previewId() != null) payload.put("previewId", command.previewId().toString());
    return payload;
  }
}
