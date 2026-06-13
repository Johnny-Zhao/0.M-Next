package com.mnext.kernel.api;

import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;

public interface MetaCommandService {
  CommandResult defineObjectType(DefineObjectTypeCommand command, Actor actor);

  CommandResult defineFieldDef(DefineFieldDefCommand command, Actor actor);

  CommandResult defineRelationType(DefineRelationTypeCommand command, Actor actor);
}
