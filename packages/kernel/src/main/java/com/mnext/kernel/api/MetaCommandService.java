package com.mnext.kernel.api;

import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.DefineValueTypeCommand;

public interface MetaCommandService {
  CommandResult defineObjectType(DefineObjectTypeCommand command, Actor actor);

  CommandResult defineFieldDef(DefineFieldDefCommand command, Actor actor);

  CommandResult defineRelationType(DefineRelationTypeCommand command, Actor actor);

  CommandResult defineValueType(DefineValueTypeCommand command, Actor actor);
}
