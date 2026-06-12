package com.mnext.kernel.api;

import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.commands.UnlinkCommand;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import com.mnext.kernel.api.commands.UpdateRelationCommand;

public interface KernelCommandService {
  CommandResult createObject(CreateObjectCommand command, Actor actor);

  CommandResult updateFields(UpdateFieldsCommand command, Actor actor);

  CommandResult createRelation(CreateRelationCommand command, Actor actor);

  CommandResult updateRelation(UpdateRelationCommand command, Actor actor);

  CommandResult unlink(UnlinkCommand command, Actor actor);
}
