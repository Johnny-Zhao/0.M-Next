package com.mnext.server;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.metamodel.ApplyTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class TemplateLifecycleService {
  private final MetaCommandService commands;
  private final TemplateRuleCopier rules;
  private final JdbcTemplate jdbc;

  TemplateLifecycleService(
      MetaCommandService commands, TemplateRuleCopier rules, JdbcTemplate jdbc) {
    this.commands = commands;
    this.rules = rules;
    this.jdbc = jdbc;
  }

  @Transactional
  CommandResult instantiateWorkspace(InstantiateWorkspaceCommand command, Actor actor) {
    var result = commands.instantiateWorkspace(command, actor);
    var versionId = templateVersionId(command.templateId(), command.version());
    rules.copyForInstantiate(versionId, command.newWorkspaceId());
    return result;
  }

  @Transactional
  CommandResult applyTemplateVersion(ApplyTemplateVersionCommand command, Actor actor) {
    var result = commands.applyTemplateVersion(command, actor);
    var templateId = workspaceTemplateId(command.workspaceId());
    var versionId = templateVersionId(templateId, command.toVersion());
    rules.copyNewRules(versionId, command.workspaceId());
    return result;
  }

  private UUID workspaceTemplateId(UUID workspaceId) {
    return jdbc.query(
        "SELECT template_id FROM workspace WHERE id = ?",
        result -> result.next() ? result.getObject("template_id", UUID.class) : null,
        workspaceId);
  }

  private UUID templateVersionId(UUID templateId, int version) {
    if (templateId == null) {
      throw new IllegalStateException("工作空间未绑定模板");
    }
    var versionId =
        jdbc.query(
            """
        SELECT id FROM scene_template_version
        WHERE template_id = ? AND version = ?
        """,
            result -> result.next() ? result.getObject("id", UUID.class) : null,
            templateId,
            version);
    if (versionId == null) {
      throw new IllegalStateException("模板版本不存在");
    }
    return versionId;
  }
}
