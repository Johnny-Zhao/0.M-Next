package com.mnext.kernel.api;

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

public interface MetaCommandService {
  CommandResult createTemplate(CreateTemplateCommand command, Actor actor);

  CommandResult createTemplateVersion(CreateTemplateVersionCommand command, Actor actor);

  CommandResult defineObjectType(DefineObjectTypeCommand command, Actor actor);

  CommandResult defineFieldDef(DefineFieldDefCommand command, Actor actor);

  CommandResult defineRelationType(DefineRelationTypeCommand command, Actor actor);

  CommandResult defineValueType(DefineValueTypeCommand command, Actor actor);

  CommandResult publishTemplateVersion(PublishTemplateVersionCommand command, Actor actor);

  CommandResult withdrawTemplateVersion(WithdrawTemplateVersionCommand command, Actor actor);

  CommandResult restoreTemplateVersion(RestoreTemplateVersionCommand command, Actor actor);

  CommandResult instantiateWorkspace(InstantiateWorkspaceCommand command, Actor actor);

  CommandResult applyTemplateVersion(ApplyTemplateVersionCommand command, Actor actor);
}
