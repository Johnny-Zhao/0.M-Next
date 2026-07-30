package com.mnext.server;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.metamodel.ApplyProfileCommand;
import com.mnext.kernel.api.metamodel.ApplyTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class TemplateLifecycleService {
  private final MetaCommandService commands;
  private final TemplateRuleCopier rules;
  private final DerivedFieldCopier derivedFields;
  private final DataCatalogRepository catalogs;
  private final JdbcTemplate jdbc;

  TemplateLifecycleService(
      MetaCommandService commands,
      TemplateRuleCopier rules,
      DerivedFieldCopier derivedFields,
      DataCatalogRepository catalogs,
      JdbcTemplate jdbc) {
    this.commands = commands;
    this.rules = rules;
    this.derivedFields = derivedFields;
    this.catalogs = catalogs;
    this.jdbc = jdbc;
  }

  @Transactional
  CommandResult instantiateWorkspace(InstantiateWorkspaceCommand command, Actor actor) {
    var result = commands.instantiateWorkspace(command, actor);
    var versionId = templateVersionId(command.templateId(), command.version());
    rules.copyForInstantiate(versionId, command.newWorkspaceId());
    derivedFields.copyForInstantiate(versionId, command.newWorkspaceId());
    catalogs.copyForInstantiate(versionId, command.newWorkspaceId(), actor.id());
    recordWorkspaceProfile(command.newWorkspaceId(), versionId, actor.id());
    return result;
  }

  @Transactional
  CommandResult applyProfile(ApplyProfileCommand command, Actor actor) {
    validateProfileDependencies(command.workspaceId(), command.templateId(), command.version());
    var result = commands.applyProfile(command, actor);
    var versionId = templateVersionId(command.templateId(), command.version());
    rules.copyForApplyProfile(versionId, command.workspaceId());
    derivedFields.copyForApplyProfile(versionId, command.workspaceId());
    catalogs.copyForApplyProfile(versionId, command.workspaceId(), actor.id());
    recordWorkspaceProfile(command.workspaceId(), versionId, actor.id());
    return result;
  }

  @Transactional
  CommandResult applyTemplateVersion(ApplyTemplateVersionCommand command, Actor actor) {
    var result = commands.applyTemplateVersion(command, actor);
    var templateId = workspaceTemplateId(command.workspaceId());
    var versionId = templateVersionId(templateId, command.toVersion());
    rules.copyNewRules(versionId, command.workspaceId());
    derivedFields.copyNewFields(versionId, command.workspaceId());
    catalogs.copyNewLayout(versionId, command.workspaceId(), actor.id());
    recordWorkspaceProfile(command.workspaceId(), versionId, actor.id());
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

  private void validateProfileDependencies(UUID workspaceId, UUID templateId, int version) {
    var dependencies =
        jdbc.query(
            """
            SELECT template.profile_kind, template.source_profile_code, template.target_profile_code
            FROM scene_template template
            JOIN scene_template_version version ON version.template_id = template.id
            WHERE template.id = ? AND version.version = ?
            """,
            result ->
                result.next()
                    ? new ProfileDependencies(
                        result.getString("profile_kind"),
                        result.getString("source_profile_code"),
                        result.getString("target_profile_code"))
                    : null,
            templateId,
            version);
    if (dependencies == null || !"mapping".equals(dependencies.kind())) return;
    if (!profileApplied(workspaceId, dependencies.sourceProfile())
        || !profileApplied(workspaceId, dependencies.targetProfile())) {
      throw new CommandRejectedException(
          new CommandError(
              "M2M-422-SOURCE-UNRESOLVED",
              "mapping profile 依赖的 source/target profile 尚未应用到工作空间",
              Map.of(),
              "先对该工作空间 ApplyProfile sourceProfile 与 targetProfile"));
    }
  }

  private boolean profileApplied(UUID workspaceId, String templateCode) {
    if (templateCode == null || templateCode.isBlank()) return false;
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS(
              SELECT 1
              FROM workspace_profile profile
              JOIN scene_template_version version ON version.id = profile.template_version_id
              JOIN scene_template template ON template.id = version.template_id
              WHERE profile.workspace_id = ? AND template.code = ?
            )
            """,
            Boolean.class,
            workspaceId,
            templateCode));
  }

  private void recordWorkspaceProfile(UUID workspaceId, UUID templateVersionId, String actor) {
    jdbc.update(
        """
        INSERT INTO workspace_profile (workspace_id, template_version_id, applied_by, applied_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (workspace_id, template_version_id) DO NOTHING
        """,
        workspaceId,
        templateVersionId,
        actor,
        Timestamp.from(Instant.now()));
  }

  private record ProfileDependencies(String kind, String sourceProfile, String targetProfile) {}
}
