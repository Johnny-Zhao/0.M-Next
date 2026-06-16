package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.metamodel.ApplyTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.DefineValueTypeCommand;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import com.mnext.kernel.api.metamodel.PublishTemplateVersionCommand;
import org.springframework.stereotype.Service;

@Service
public class MetaCommandServiceImpl implements MetaCommandService {
  private final DefineObjectTypeHandler objectTypes;
  private final DefineFieldDefHandler fields;
  private final DefineRelationTypeHandler relations;
  private final DefineValueTypeHandler valueTypes;
  private final PublishTemplateVersionHandler publishTemplateVersions;
  private final InstantiateWorkspaceHandler instantiateWorkspaces;
  private final ApplyTemplateVersionHandler applyTemplateVersions;

  public MetaCommandServiceImpl(
      DefineObjectTypeHandler objectTypes,
      DefineFieldDefHandler fields,
      DefineRelationTypeHandler relations,
      DefineValueTypeHandler valueTypes,
      PublishTemplateVersionHandler publishTemplateVersions,
      InstantiateWorkspaceHandler instantiateWorkspaces,
      ApplyTemplateVersionHandler applyTemplateVersions) {
    this.objectTypes = objectTypes;
    this.fields = fields;
    this.relations = relations;
    this.valueTypes = valueTypes;
    this.publishTemplateVersions = publishTemplateVersions;
    this.instantiateWorkspaces = instantiateWorkspaces;
    this.applyTemplateVersions = applyTemplateVersions;
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

  @Override
  public CommandResult publishTemplateVersion(PublishTemplateVersionCommand command, Actor actor) {
    return publishTemplateVersions.execute(command, actor);
  }

  @Override
  public CommandResult instantiateWorkspace(InstantiateWorkspaceCommand command, Actor actor) {
    return instantiateWorkspaces.execute(command, actor);
  }

  @Override
  public CommandResult applyTemplateVersion(ApplyTemplateVersionCommand command, Actor actor) {
    return applyTemplateVersions.execute(command, actor);
  }
}
