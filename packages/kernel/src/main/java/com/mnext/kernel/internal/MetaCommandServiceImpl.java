package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.metamodel.ApplyTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.CreateTemplateCommand;
import com.mnext.kernel.api.metamodel.CreateTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.DefineValueTypeCommand;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import com.mnext.kernel.api.metamodel.PublishTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.RestoreTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.WithdrawTemplateVersionCommand;
import org.springframework.stereotype.Service;

@Service
public class MetaCommandServiceImpl implements MetaCommandService {
  private final CreateTemplateHandler createTemplates;
  private final CreateTemplateVersionHandler createTemplateVersions;
  private final DefineObjectTypeHandler objectTypes;
  private final DefineFieldDefHandler fields;
  private final DefineRelationTypeHandler relations;
  private final DefineValueTypeHandler valueTypes;
  private final PublishTemplateVersionHandler publishTemplateVersions;
  private final WithdrawTemplateVersionHandler withdrawTemplateVersions;
  private final RestoreTemplateVersionHandler restoreTemplateVersions;
  private final InstantiateWorkspaceHandler instantiateWorkspaces;
  private final ApplyTemplateVersionHandler applyTemplateVersions;

  public MetaCommandServiceImpl(
      CreateTemplateHandler createTemplates,
      CreateTemplateVersionHandler createTemplateVersions,
      DefineObjectTypeHandler objectTypes,
      DefineFieldDefHandler fields,
      DefineRelationTypeHandler relations,
      DefineValueTypeHandler valueTypes,
      PublishTemplateVersionHandler publishTemplateVersions,
      WithdrawTemplateVersionHandler withdrawTemplateVersions,
      RestoreTemplateVersionHandler restoreTemplateVersions,
      InstantiateWorkspaceHandler instantiateWorkspaces,
      ApplyTemplateVersionHandler applyTemplateVersions) {
    this.createTemplates = createTemplates;
    this.createTemplateVersions = createTemplateVersions;
    this.objectTypes = objectTypes;
    this.fields = fields;
    this.relations = relations;
    this.valueTypes = valueTypes;
    this.publishTemplateVersions = publishTemplateVersions;
    this.withdrawTemplateVersions = withdrawTemplateVersions;
    this.restoreTemplateVersions = restoreTemplateVersions;
    this.instantiateWorkspaces = instantiateWorkspaces;
    this.applyTemplateVersions = applyTemplateVersions;
  }

  @Override
  public CommandResult createTemplate(CreateTemplateCommand command, Actor actor) {
    return createTemplates.execute(command, actor);
  }

  @Override
  public CommandResult createTemplateVersion(CreateTemplateVersionCommand command, Actor actor) {
    return createTemplateVersions.execute(command, actor);
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
  public CommandResult withdrawTemplateVersion(
      WithdrawTemplateVersionCommand command, Actor actor) {
    return withdrawTemplateVersions.execute(command, actor);
  }

  @Override
  public CommandResult restoreTemplateVersion(RestoreTemplateVersionCommand command, Actor actor) {
    return restoreTemplateVersions.execute(command, actor);
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
