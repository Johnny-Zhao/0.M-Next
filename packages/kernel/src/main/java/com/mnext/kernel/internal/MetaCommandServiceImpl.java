package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.DefineValueTypeCommand;
import org.springframework.stereotype.Service;

@Service
public class MetaCommandServiceImpl implements MetaCommandService {
  private final DefineObjectTypeHandler objectTypes;
  private final DefineFieldDefHandler fields;
  private final DefineRelationTypeHandler relations;
  private final DefineValueTypeHandler valueTypes;

  public MetaCommandServiceImpl(
      DefineObjectTypeHandler objectTypes,
      DefineFieldDefHandler fields,
      DefineRelationTypeHandler relations,
      DefineValueTypeHandler valueTypes) {
    this.objectTypes = objectTypes;
    this.fields = fields;
    this.relations = relations;
    this.valueTypes = valueTypes;
  }

  @Override
  public CommandResult defineObjectType(DefineObjectTypeCommand command, Actor actor) {
    return objectTypes.execute(command, actor);
  }

  @Override
  public CommandResult defineFieldDef(DefineFieldDefCommand command, Actor actor) {
    return fields.execute(command, actor);
  }

  @Override
  public CommandResult defineRelationType(DefineRelationTypeCommand command, Actor actor) {
    return relations.execute(command, actor);
  }

  @Override
  public CommandResult defineValueType(DefineValueTypeCommand command, Actor actor) {
    return valueTypes.execute(command, actor);
  }
}
