package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.commands.ArchiveCommand;
import com.mnext.kernel.api.commands.ChangeStateCommand;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.commands.UnlinkCommand;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import com.mnext.kernel.api.commands.UpdateRelationCommand;
import org.springframework.stereotype.Service;

@Service
public class KernelCommandServiceImpl implements KernelCommandService {
  private final ArchiveHandler archiveHandler;
  private final ChangeStateHandler changeStateHandler;
  private final CreateObjectHandler createObjectHandler;
  private final UpdateFieldsHandler updateFieldsHandler;
  private final CreateRelationHandler createRelationHandler;
  private final UpdateRelationHandler updateRelationHandler;
  private final UnlinkHandler unlinkHandler;

  public KernelCommandServiceImpl(
      ArchiveHandler archiveHandler,
      ChangeStateHandler changeStateHandler,
      CreateObjectHandler createObjectHandler,
      UpdateFieldsHandler updateFieldsHandler,
      CreateRelationHandler createRelationHandler,
      UpdateRelationHandler updateRelationHandler,
      UnlinkHandler unlinkHandler) {
    this.archiveHandler = archiveHandler;
    this.changeStateHandler = changeStateHandler;
    this.createObjectHandler = createObjectHandler;
    this.updateFieldsHandler = updateFieldsHandler;
    this.createRelationHandler = createRelationHandler;
    this.updateRelationHandler = updateRelationHandler;
    this.unlinkHandler = unlinkHandler;
  }

  @Override
  public CommandResult archive(ArchiveCommand command, Actor actor) {
    return archiveHandler.execute(command, actor);
  }

  @Override
  public CommandResult changeState(ChangeStateCommand command, Actor actor) {
    return changeStateHandler.execute(command, actor);
  }

  @Override
  public CommandResult createObject(CreateObjectCommand command, Actor actor) {
    return createObjectHandler.execute(command, actor);
  }

  @Override
  public CommandResult updateFields(UpdateFieldsCommand command, Actor actor) {
    return updateFieldsHandler.execute(command, actor);
  }

  @Override
  public CommandResult createRelation(CreateRelationCommand command, Actor actor) {
    return createRelationHandler.execute(command, actor);
  }

  @Override
  public CommandResult updateRelation(UpdateRelationCommand command, Actor actor) {
    return updateRelationHandler.execute(command, actor);
  }

  @Override
  public CommandResult unlink(UnlinkCommand command, Actor actor) {
    return unlinkHandler.execute(command, actor);
  }
}
