package com.mnext.kernel.api;

import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;

public interface KernelCommandService {
  CommandResult createObject(CreateObjectCommand command, Actor actor);

  CommandResult updateFields(UpdateFieldsCommand command, Actor actor);
}
