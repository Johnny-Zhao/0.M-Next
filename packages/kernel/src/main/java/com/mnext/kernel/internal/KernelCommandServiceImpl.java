package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import org.springframework.stereotype.Service;

@Service
public class KernelCommandServiceImpl implements KernelCommandService {
  private final CreateObjectHandler createObjectHandler;
  private final UpdateFieldsHandler updateFieldsHandler;

  public KernelCommandServiceImpl(
      CreateObjectHandler createObjectHandler, UpdateFieldsHandler updateFieldsHandler) {
    this.createObjectHandler = createObjectHandler;
    this.updateFieldsHandler = updateFieldsHandler;
  }

  @Override
  public CommandResult createObject(CreateObjectCommand command, Actor actor) {
    return createObjectHandler.execute(command, actor);
  }

  @Override
  public CommandResult updateFields(UpdateFieldsCommand command, Actor actor) {
    return updateFieldsHandler.execute(command, actor);
  }
}
