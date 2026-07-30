package com.mnext.server;

import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.server.plugin.ProfileManifest;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DataCatalogRepository {
  private static final String FALLBACK_DIRECTORY = "data-source";
  private final JdbcTemplate jdbc;

  public DataCatalogRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void syncTemplateLayout(UUID versionId, ProfileManifest manifest) {
    var directories = manifest.catalogOrEmpty().directoriesOrEmpty();
    var libraries = manifest.catalogOrEmpty().placementsOrEmpty();
    for (var directory : directories) {
      jdbc.update(
          """
          INSERT INTO template_catalog_directory
            (template_version_id, code, name, parent_code, sort_order)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (template_version_id, code) DO UPDATE SET
            name = EXCLUDED.name, parent_code = EXCLUDED.parent_code, sort_order = EXCLUDED.sort_order
          """,
          versionId,
          directory.code(),
          directory.name(),
          directory.parentCode(),
          directory.sortOrder());
    }
    for (var placement : libraries) {
      jdbc.update(
          """
          INSERT INTO template_catalog_library
            (template_version_id, object_type_code, directory_code, sort_order)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (template_version_id, object_type_code) DO UPDATE SET
            directory_code = EXCLUDED.directory_code, sort_order = EXCLUDED.sort_order
          """,
          versionId,
          placement.objectTypeCode(),
          placement.directoryCode(),
          placement.sortOrder());
    }
    deleteMissingTemplateLibraries(versionId, libraries);
    deleteMissingTemplateDirectories(versionId, directories);
  }

  public void syncInstalledWorkspaces(UUID templateVersionId, String actor) {
    var workspaces =
        jdbc.query(
            """
            SELECT DISTINCT workspace_id
            FROM (
              SELECT workspace.id AS workspace_id
              FROM workspace
              JOIN scene_template_version version ON version.template_id = workspace.template_id
              WHERE version.id = ?
              UNION
              SELECT profile.workspace_id
              FROM workspace_profile profile
              JOIN scene_template_version version ON version.id = profile.template_version_id
              WHERE version.template_id = (SELECT template_id FROM scene_template_version WHERE id = ?)
            ) candidates
            """,
            (row, ignored) -> row.getObject(1, UUID.class),
            templateVersionId,
            templateVersionId);
    for (var workspaceId : workspaces) syncWorkspace(templateVersionId, workspaceId, actor);
  }

  void copyForInstantiate(UUID templateVersionId, UUID workspaceId, String actor) {
    syncWorkspace(templateVersionId, workspaceId, actor);
  }

  void copyForApplyProfile(UUID templateVersionId, UUID workspaceId, String actor) {
    syncWorkspace(templateVersionId, workspaceId, actor);
  }

  void copyNewLayout(UUID templateVersionId, UUID workspaceId, String actor) {
    syncWorkspace(templateVersionId, workspaceId, actor);
  }

  CatalogView catalog(UUID workspaceId) {
    var directories =
        jdbc.query(
            """
            SELECT code, name, parent_code, sort_order
            FROM workspace_catalog_directory
            WHERE workspace_id = ? ORDER BY sort_order, code
            """,
            (row, ignored) ->
                new CatalogDirectory(
                    row.getString(1), row.getString(2), row.getString(3), row.getInt(4)),
            workspaceId);
    var libraries =
        jdbc.query(
            """
            SELECT library.object_type_code, library.directory_code, library.sort_order,
                   COUNT(object.object_id) AS record_count
            FROM workspace_catalog_library library
            LEFT JOIN rm_object object ON object.workspace_id = library.workspace_id
              AND object.object_type_code = library.object_type_code
              AND object.status <> 'DELETED'
            WHERE library.workspace_id = ?
            GROUP BY library.object_type_code, library.directory_code, library.sort_order
            ORDER BY library.sort_order, library.object_type_code
            """,
            (row, ignored) ->
                new CatalogLibrary(
                    row.getString(1), row.getString(2), row.getInt(3), row.getLong(4)),
            workspaceId);
    return new CatalogView(workspaceId, directories, libraries);
  }

  private void syncWorkspace(UUID templateVersionId, UUID workspaceId, String actor) {
    var directories = templateDirectories(templateVersionId);
    var libraries = templateLibraries(templateVersionId);
    if (directories.isEmpty() && libraries.isEmpty()) {
      var fallbackDirectory = fallbackDirectoryCode(templateVersionId);
      directories = List.of(new TemplateDirectory(fallbackDirectory, "数据源", null, 0));
      libraries = fallbackLibraries(workspaceId, templateVersionId, fallbackDirectory);
    }
    var availableTypes = availableObjectTypes(workspaceId);
    assertCatalogOwnership(workspaceId, templateVersionId, directories, libraries, availableTypes);
    for (var directory : directories)
      upsertDirectory(workspaceId, templateVersionId, directory, actor);
    for (var library : libraries) {
      if (availableTypes.contains(library.objectTypeCode())) {
        upsertLibrary(workspaceId, templateVersionId, library, actor);
      }
    }
    deleteMissingWorkspaceLibraries(workspaceId, templateVersionId, libraries, availableTypes);
    deleteMissingWorkspaceDirectories(workspaceId, templateVersionId, directories);
  }

  private void assertCatalogOwnership(
      UUID workspaceId,
      UUID templateVersionId,
      List<TemplateDirectory> directories,
      List<TemplateLibrary> libraries,
      Set<String> availableTypes) {
    for (var directory : directories) {
      var owner = directoryOwner(workspaceId, templateVersionId, directory.code());
      if (owner != null) throw catalogConflict("目录", directory.code(), owner);
    }
    for (var library : libraries) {
      if (!availableTypes.contains(library.objectTypeCode())) continue;
      var owner = libraryOwner(workspaceId, templateVersionId, library.objectTypeCode());
      if (owner != null) throw catalogConflict("记录库", library.objectTypeCode(), owner);
    }
  }

  private CommandRejectedException catalogConflict(String kind, String code, String templateCode) {
    return new CommandRejectedException(
        new CommandError(
            "META-400-SCHEMA-INVALID",
            "数据目录"
                + kind
                + "编码“"
                + code
                + "”已被 Profile “"
                + templateCode
                + "”占用；请为新 Profile 使用工作空间内唯一的 catalog code / objectTypeCode",
            Map.of("catalogKind", kind, "catalogCode", code, "templateCode", templateCode),
            "请为新 Profile 使用工作空间内唯一的 catalog code / objectTypeCode 后重试"));
  }

  private String directoryOwner(UUID workspaceId, UUID templateVersionId, String code) {
    return jdbc.query(
        """
        SELECT template.code
        FROM workspace_catalog_directory catalog
        JOIN scene_template_version source ON source.id = catalog.source_template_version_id
        JOIN scene_template template ON template.id = source.template_id
        WHERE catalog.workspace_id = ? AND catalog.code = ?
          AND source.template_id <> (SELECT template_id FROM scene_template_version WHERE id = ?)
        """,
        result -> result.next() ? result.getString(1) : null,
        workspaceId,
        code,
        templateVersionId);
  }

  private String libraryOwner(UUID workspaceId, UUID templateVersionId, String objectTypeCode) {
    return jdbc.query(
        """
        SELECT template.code
        FROM workspace_catalog_library catalog
        JOIN scene_template_version source ON source.id = catalog.source_template_version_id
        JOIN scene_template template ON template.id = source.template_id
        WHERE catalog.workspace_id = ? AND catalog.object_type_code = ?
          AND source.template_id <> (SELECT template_id FROM scene_template_version WHERE id = ?)
        """,
        result -> result.next() ? result.getString(1) : null,
        workspaceId,
        objectTypeCode,
        templateVersionId);
  }

  private void deleteMissingTemplateLibraries(
      UUID versionId, List<ProfileManifest.Placement> placements) {
    var expected =
        placements.stream()
            .map(ProfileManifest.Placement::objectTypeCode)
            .collect(Collectors.toSet());
    for (var code : templateLibraryCodes(versionId)) {
      if (!expected.contains(code)) {
        jdbc.update(
            "DELETE FROM template_catalog_library WHERE template_version_id = ? AND object_type_code = ?",
            versionId,
            code);
      }
    }
  }

  private void deleteMissingTemplateDirectories(
      UUID versionId, List<ProfileManifest.Directory> directories) {
    var expected =
        directories.stream().map(ProfileManifest.Directory::code).collect(Collectors.toSet());
    for (var code : templateDirectoryCodes(versionId)) {
      if (!expected.contains(code)) {
        jdbc.update(
            "DELETE FROM template_catalog_directory WHERE template_version_id = ? AND code = ?",
            versionId,
            code);
      }
    }
  }

  private Set<String> templateLibraryCodes(UUID versionId) {
    return new java.util.HashSet<>(
        jdbc.query(
            "SELECT object_type_code FROM template_catalog_library WHERE template_version_id = ?",
            (row, ignored) -> row.getString(1),
            versionId));
  }

  private Set<String> templateDirectoryCodes(UUID versionId) {
    return new java.util.HashSet<>(
        jdbc.query(
            "SELECT code FROM template_catalog_directory WHERE template_version_id = ?",
            (row, ignored) -> row.getString(1),
            versionId));
  }

  private void deleteMissingWorkspaceLibraries(
      UUID workspaceId,
      UUID templateVersionId,
      List<TemplateLibrary> libraries,
      Set<String> availableTypes) {
    var expected =
        libraries.stream()
            .map(TemplateLibrary::objectTypeCode)
            .filter(availableTypes::contains)
            .collect(Collectors.toSet());
    for (var code : workspaceLibraryCodes(workspaceId, templateVersionId)) {
      if (!expected.contains(code)) {
        jdbc.update(
            """
            DELETE FROM workspace_catalog_library library
            WHERE library.workspace_id = ? AND library.object_type_code = ?
              AND library.source_template_version_id IN (
                SELECT id FROM scene_template_version
                WHERE template_id = (SELECT template_id FROM scene_template_version WHERE id = ?)
              )
            """,
            workspaceId,
            code,
            templateVersionId);
      }
    }
  }

  private void deleteMissingWorkspaceDirectories(
      UUID workspaceId, UUID templateVersionId, List<TemplateDirectory> directories) {
    var expected = directories.stream().map(TemplateDirectory::code).collect(Collectors.toSet());
    for (var code : workspaceDirectoryCodes(workspaceId, templateVersionId)) {
      if (!expected.contains(code)) deleteWorkspaceDirectory(workspaceId, templateVersionId, code);
    }
  }

  private Set<String> workspaceLibraryCodes(UUID workspaceId, UUID templateVersionId) {
    return catalogCodes(
        "workspace_catalog_library", "object_type_code", workspaceId, templateVersionId);
  }

  private Set<String> workspaceDirectoryCodes(UUID workspaceId, UUID templateVersionId) {
    return catalogCodes("workspace_catalog_directory", "code", workspaceId, templateVersionId);
  }

  private Set<String> catalogCodes(
      String table, String column, UUID workspaceId, UUID templateVersionId) {
    return new java.util.HashSet<>(
        jdbc.query(
            """
            SELECT catalog.%s FROM %s catalog
            JOIN scene_template_version source ON source.id = catalog.source_template_version_id
            WHERE catalog.workspace_id = ?
              AND source.template_id = (SELECT template_id FROM scene_template_version WHERE id = ?)
            """
                .formatted(column, table),
            (row, ignored) -> row.getString(1),
            workspaceId,
            templateVersionId));
  }

  private void deleteWorkspaceDirectory(UUID workspaceId, UUID templateVersionId, String code) {
    jdbc.update(
        """
        DELETE FROM workspace_catalog_directory directory
        WHERE directory.workspace_id = ? AND directory.code = ?
          AND directory.source_template_version_id IN (
            SELECT id FROM scene_template_version
            WHERE template_id = (SELECT template_id FROM scene_template_version WHERE id = ?)
          )
          AND NOT EXISTS (
            SELECT 1 FROM workspace_catalog_library library
            WHERE library.workspace_id = directory.workspace_id
              AND library.directory_code = directory.code
          )
        """,
        workspaceId,
        code,
        templateVersionId);
  }

  private List<TemplateDirectory> templateDirectories(UUID templateVersionId) {
    return jdbc.query(
        """
        SELECT code, name, parent_code, sort_order
        FROM template_catalog_directory
        WHERE template_version_id = ? ORDER BY sort_order, code
        """,
        (row, ignored) ->
            new TemplateDirectory(
                row.getString(1), row.getString(2), row.getString(3), row.getInt(4)),
        templateVersionId);
  }

  private List<TemplateLibrary> templateLibraries(UUID templateVersionId) {
    return jdbc.query(
        """
        SELECT object_type_code, directory_code, sort_order
        FROM template_catalog_library
        WHERE template_version_id = ? ORDER BY sort_order, object_type_code
        """,
        (row, ignored) -> new TemplateLibrary(row.getString(1), row.getString(2), row.getInt(3)),
        templateVersionId);
  }

  private String fallbackDirectoryCode(UUID templateVersionId) {
    var template = templateIdentity(templateVersionId);
    var normalized = template.code().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-");
    normalized = normalized.replaceAll("(^-+|-+$)", "");
    if (normalized.isBlank()) normalized = "template";
    var suffix = "-" + template.id();
    var maxLength = 128 - FALLBACK_DIRECTORY.length() - 1 - suffix.length();
    return FALLBACK_DIRECTORY
        + "-"
        + normalized.substring(0, Math.min(normalized.length(), maxLength))
        + suffix;
  }

  private List<TemplateLibrary> fallbackLibraries(
      UUID workspaceId, UUID templateVersionId, String directoryCode) {
    return jdbc.query(
        """
        SELECT DISTINCT type.code FROM object_type type
        WHERE type.workspace_id = ?
          AND (
            type.template_version_id IN (
              SELECT id FROM scene_template_version
              WHERE template_id = (SELECT template_id FROM scene_template_version WHERE id = ?)
            )
            OR (
              type.template_version_id IS NULL
              AND (SELECT template_id FROM workspace WHERE id = ?) =
                  (SELECT template_id FROM scene_template_version WHERE id = ?)
            )
          )
        ORDER BY type.code
        """,
        (row, index) -> new TemplateLibrary(row.getString(1), directoryCode, index),
        workspaceId,
        templateVersionId,
        workspaceId,
        templateVersionId);
  }

  private TemplateIdentity templateIdentity(UUID templateVersionId) {
    return jdbc.query(
        """
        SELECT template.id, template.code
        FROM scene_template_version version
        JOIN scene_template template ON template.id = version.template_id
        WHERE version.id = ?
        """,
        result ->
            result.next()
                ? new TemplateIdentity(result.getObject(1, UUID.class), result.getString(2))
                : null,
        templateVersionId);
  }

  private java.util.Set<String> availableObjectTypes(UUID workspaceId) {
    return new java.util.HashSet<>(
        jdbc.query(
            "SELECT DISTINCT code FROM object_type WHERE workspace_id = ?",
            (row, ignored) -> row.getString(1),
            workspaceId));
  }

  private void upsertDirectory(
      UUID workspaceId, UUID templateVersionId, TemplateDirectory directory, String actor) {
    var updated =
        jdbc.update(
            """
        INSERT INTO workspace_catalog_directory
          (workspace_id, code, name, parent_code, sort_order, source_template_version_id, installed_by, installed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (workspace_id, code) DO UPDATE SET
          name = EXCLUDED.name, parent_code = EXCLUDED.parent_code, sort_order = EXCLUDED.sort_order,
          source_template_version_id = EXCLUDED.source_template_version_id,
          installed_by = EXCLUDED.installed_by, installed_at = EXCLUDED.installed_at
        WHERE workspace_catalog_directory.source_template_version_id IN (
          SELECT id FROM scene_template_version
          WHERE template_id = (SELECT template_id FROM scene_template_version WHERE id = EXCLUDED.source_template_version_id)
        )
        """,
            workspaceId,
            directory.code(),
            directory.name(),
            directory.parentCode(),
            directory.sortOrder(),
            templateVersionId,
            actor);
    if (updated == 0) {
      throw catalogConflict(
          "目录", directory.code(), directoryOwner(workspaceId, templateVersionId, directory.code()));
    }
  }

  private void upsertLibrary(
      UUID workspaceId, UUID templateVersionId, TemplateLibrary library, String actor) {
    var updated =
        jdbc.update(
            """
        INSERT INTO workspace_catalog_library
          (workspace_id, object_type_code, directory_code, sort_order, source_template_version_id, installed_by, installed_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (workspace_id, object_type_code) DO UPDATE SET
          directory_code = EXCLUDED.directory_code, sort_order = EXCLUDED.sort_order,
          source_template_version_id = EXCLUDED.source_template_version_id,
          installed_by = EXCLUDED.installed_by, installed_at = EXCLUDED.installed_at
        WHERE workspace_catalog_library.source_template_version_id IN (
          SELECT id FROM scene_template_version
          WHERE template_id = (SELECT template_id FROM scene_template_version WHERE id = EXCLUDED.source_template_version_id)
        )
        """,
            workspaceId,
            library.objectTypeCode(),
            library.directoryCode(),
            library.sortOrder(),
            templateVersionId,
            actor);
    if (updated == 0) {
      throw catalogConflict(
          "记录库",
          library.objectTypeCode(),
          libraryOwner(workspaceId, templateVersionId, library.objectTypeCode()));
    }
  }

  public record CatalogView(
      UUID workspaceId, List<CatalogDirectory> directories, List<CatalogLibrary> libraries) {}

  public record CatalogDirectory(String code, String name, String parentCode, int sortOrder) {}

  public record CatalogLibrary(
      String objectTypeCode, String directoryCode, int sortOrder, long recordCount) {}

  private record TemplateDirectory(String code, String name, String parentCode, int sortOrder) {}

  private record TemplateLibrary(String objectTypeCode, String directoryCode, int sortOrder) {}

  private record TemplateIdentity(UUID id, String code) {}
}
