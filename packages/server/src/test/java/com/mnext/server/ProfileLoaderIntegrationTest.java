package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.events.EventEnvelope;
import com.mnext.server.plugin.ProfileManifest;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"mnext.outbox.enabled=false", "mnext.readmodel.enabled=false"})
class ProfileLoaderIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final String ACTOR = "profile-loader-user";

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired ProfileLoader loader;
  @Autowired ObjectMapper mapper;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestRestTemplate http;
  @Autowired DerivedEvaluator derivedEvaluator;
  @Autowired ReadModelProjection projection;
  @LocalServerPort int port;

  @Test
  void installUninstallRestoreAndIdempotencyFollowProfileLifecycle() throws Exception {
    var manifest = fixture();
    loader.install(manifest, Actor.user(ACTOR));
    assertEquals("published", templateStatus(manifest.templateCode()));
    assertTrue(templateCodes().contains(manifest.templateCode()));
    assertEquals(1, templateCount(manifest.templateCode()));

    loader.install(manifest, Actor.user(ACTOR));
    assertEquals(1, templateCount(manifest.templateCode()));
    assertEquals(1, templateVersionCount(manifest.templateCode()));

    var template = templateId(manifest.templateCode());
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-profile-loader")));
    assertEquals(1, copiedCount("derived_field", workspace));
    assertEquals(1, copiedCount("rule_def", workspace));

    var roomType = objectType(workspace, "room");
    var fixtureType = objectType(workspace, "fixture");
    var relationType = relationType(workspace, "contains_fixture");
    var room =
        createObject(
            workspace, roomType, "create-profile-room", Map.of("name", "lab", "base_score", 0));
    var fixture =
        createObject(
            workspace, fixtureType, "create-profile-fixture", Map.of("name", "lamp", "load", 7));
    applyEvents(command(workspace, createRelation(workspace, relationType, room, fixture)));
    assertDecimal("7", derivedEvaluator.evaluate(workspace, room, "fixture_load"));

    var runId = runId(rule(workspace, runRuleCheck(workspace, "room", "run-profile-rules")));
    assertEquals(1, countResults(workspace, runId, "base_score_floor"));
    // Scoped runs are not used for the legacy full-workspace rule-status badge.
    assertEquals("UNKNOWN", ruleStatus(workspace, room));

    loader.uninstall(manifest.templateCode(), Actor.user(ACTOR));
    assertEquals("withdrawn", templateStatus(manifest.templateCode()));
    assertFalse(templateCodes().contains(manifest.templateCode()));
    var rejected = meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-withdrawn"));
    assertEquals(422, rejected.getStatusCode().value(), String.valueOf(rejected.getBody()));
    assertEquals("KERNEL-422-TEMPLATE-NOT-PUBLISHED", errorCode(rejected));

    createObject(workspace, fixtureType, "create-after-withdraw", Map.of("name", "fan", "load", 3));
    runId = runId(rule(workspace, runRuleCheck(workspace, "room", "run-after-withdraw")));
    assertEquals(1, countResults(workspace, runId, "base_score_floor"));

    loader.install(manifest, Actor.user(ACTOR));
    assertEquals("published", templateStatus(manifest.templateCode()));
    assertTrue(templateCodes().contains(manifest.templateCode()));
    assertOk(meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-after-restore")));
  }

  @Test
  void badManifestFailsBeforeLeavingHalfInstalledTemplate() throws Exception {
    var manifest = badFixture();
    var failure =
        assertThrows(
            CommandRejectedException.class, () -> loader.install(manifest, Actor.user(ACTOR)));
    assertEquals("META-400-SCHEMA-INVALID", failure.error().code());
    assertEquals(0, templateCount(manifest.templateCode()));
  }

  @Test
  void installPersistsManifestTagsOnTemplateVersion() throws Exception {
    var manifest =
        taggedProfile(
            fixture(), "profile-loader-tagged", "profile_loader_tagged", "建筑装饰", "室内设计", "户型评估");

    loader.install(manifest, Actor.user(ACTOR));

    var tags = mapper.readTree(templateTags(manifest.templateCode()));
    assertEquals("建筑装饰", tags.get("industry").get(0).asText());
    assertEquals("室内设计", tags.get("profession").get(0).asText());
    assertEquals("户型评估", tags.get("scenario").get(0).asText());
  }

  @Test
  void installsCatalogLayoutIdempotentlyAndFallsBackForProfilesWithoutOne() throws Exception {
    var manifest = catalogProfile(fixture(), "profile-loader-catalog", "profile_loader_catalog");
    loader.install(manifest, Actor.user(ACTOR));
    var workspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(templateId(manifest.templateCode()), workspace, "instantiate-catalog")));
    createObject(
        workspace,
        objectType(workspace, "room"),
        "create-catalog-room",
        Map.of("name", "Catalog Room", "base_score", 0));

    var catalog = catalog(workspace);
    assertEquals(
        List.of("root", "child"),
        catalogDirectories(catalog).stream().map(item -> item.get("code")).toList());
    assertEquals(
        List.of("fixture", "room"),
        catalogLibraries(catalog).stream().map(item -> item.get("objectTypeCode")).toList());
    assertEquals(1, catalogLibrary(catalog, "room").get("recordCount"));
    var otherWorkspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(
                templateId(manifest.templateCode()), otherWorkspace, "instantiate-catalog-other")));
    createObject(
        otherWorkspace,
        objectType(otherWorkspace, "room"),
        "create-catalog-other-room",
        Map.of("name", "Other Catalog Room", "base_score", 0));
    assertEquals(1, catalogLibrary(catalog(workspace), "room").get("recordCount"));
    loader.install(manifest, Actor.user(ACTOR));
    assertEquals(2, catalogDirectoryCount(workspace));
    assertEquals(2, catalogLibraryCount(workspace));

    var fallback =
        profileVariant(
            fixture(), "profile-loader-catalog-fallback", "profile_loader_catalog_fallback");
    loader.install(fallback, Actor.user(ACTOR));
    var fallbackWorkspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(
                templateId(fallback.templateCode()),
                fallbackWorkspace,
                "instantiate-catalog-fallback")));
    var fallbackCatalog = catalog(fallbackWorkspace);
    assertTrue(
        ((String) catalogDirectories(fallbackCatalog).getFirst().get("code"))
            .startsWith("data-source-profile-loader-catalog-fallback-"));
    assertEquals(2, catalogLibraries(fallbackCatalog).size());
  }

  @Test
  void keepsEmptyCatalogLayoutsAndSynchronizesAppliedProfileUpgrades() throws Exception {
    var base =
        withCatalog(
            profileVariant(fixture(), "catalog-base", "profile_loader_catalog_base"),
            emptyCatalog("base-root"));
    var addon = catalogProfile(fixture(), "catalog-addon", "profile_loader_catalog_addon");
    var empty =
        new ProfileManifest(
            "catalog-empty",
            "Empty Catalog",
            "1.0.0",
            "profile_loader_catalog_empty",
            "domain",
            null,
            null,
            addon.tags(),
            addon.valueTypes(),
            addon.objectTypes(),
            addon.fields(),
            addon.relations(),
            addon.derived(),
            profileVariant(addon, "catalog-empty", "profile_loader_catalog_empty").rules(),
            new ProfileManifest.CatalogLayout(
                List.of(new ProfileManifest.Directory("other-root", "Other", null, 10)),
                List.of()));
    loader.install(base, Actor.user(ACTOR));
    loader.install(addon, Actor.user(ACTOR));
    loader.install(empty, Actor.user(ACTOR));

    var workspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(templateId(base.templateCode()), workspace, "instantiate-catalog-base")));
    assertOk(
        meta(
            workspace,
            applyProfile(workspace, templateId(addon.templateCode()), 1, "apply-catalog-addon")));
    assertOk(
        meta(
            workspace,
            applyProfile(workspace, templateId(empty.templateCode()), 1, "apply-empty-catalog")));
    assertTrue(
        catalogDirectories(catalog(workspace)).stream()
            .anyMatch(item -> "other-root".equals(item.get("code"))));

    var upgraded =
        new ProfileManifest(
            addon.id(),
            addon.name(),
            "1.1.0",
            addon.templateCode(),
            "domain",
            null,
            null,
            addon.tags(),
            addon.valueTypes(),
            addon.objectTypes(),
            addon.fields(),
            addon.relations(),
            addon.derived(),
            addon.rules(),
            new ProfileManifest.CatalogLayout(
                List.of(
                    new ProfileManifest.Directory("root", "Root", null, 10),
                    new ProfileManifest.Directory("relocated", "Relocated", "root", 20)),
                List.of(new ProfileManifest.Placement("room", "relocated", 10))));
    loader.install(upgraded, Actor.user(ACTOR));

    var catalog = catalog(workspace);
    var upgradedVersion = templateVersionId(addon.templateCode(), 2);
    assertEquals(0, templateCatalogCount("template_catalog_directory", upgradedVersion, "child"));
    assertEquals(0, templateCatalogCount("template_catalog_library", upgradedVersion, "fixture"));
    assertEquals("relocated", catalogLibrary(catalog, "room").get("directoryCode"));
    assertFalse(
        catalogLibraries(catalog).stream()
            .anyMatch(item -> "fixture".equals(item.get("objectTypeCode"))));
    assertFalse(
        catalogDirectories(catalog).stream().anyMatch(item -> "child".equals(item.get("code"))));
    assertTrue(
        catalogDirectories(catalog).stream()
            .anyMatch(item -> "other-root".equals(item.get("code"))));
    assertEquals(upgradedVersion, catalogDirectorySource(workspace, "root"));
    assertEquals(upgradedVersion, catalogLibrarySource(workspace, "room"));
    assertEquals(Set.of("workspaceId", "directories", "libraries"), catalog.keySet());
    assertThrows(
        org.springframework.dao.DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                """
                INSERT INTO workspace_catalog_directory
                  (workspace_id, code, name, parent_code, sort_order, source_template_version_id, installed_by, installed_at)
                VALUES (?, 'invalid-parent', 'Invalid', 'missing', 0, ?, ?, CURRENT_TIMESTAMP)
                """,
                workspace,
                upgradedVersion,
                ACTOR));
  }

  @Test
  void scopesFallbackCatalogsToTheirProfilesAndKeepsTemplateCodesStable() throws Exception {
    var first = legacyProfile("legacy-first", "legacy_first", "legacy_room");
    var second = legacyProfile("legacy-second", "legacy_second", "legacy_fixture");
    loader.install(first, Actor.user(ACTOR));
    loader.install(second, Actor.user(ACTOR));

    var workspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(templateId(first.templateCode()), workspace, "instantiate-legacy-first")));
    assertOk(
        meta(
            workspace,
            applyProfile(workspace, templateId(second.templateCode()), 1, "apply-legacy-second")));

    var initialCatalog = catalog(workspace);
    assertEquals(Set.of("legacy_room", "legacy_fixture"), catalogObjectTypeCodes(initialCatalog));
    var firstDirectory = catalogLibrary(initialCatalog, "legacy_room").get("directoryCode");
    var secondDirectory = catalogLibrary(initialCatalog, "legacy_fixture").get("directoryCode");
    assertNotEquals(firstDirectory, secondDirectory);
    assertTrue(((String) firstDirectory).startsWith("data-source-legacy-first-"));
    assertTrue(((String) secondDirectory).startsWith("data-source-legacy-second-"));

    loader.install(first, Actor.user(ACTOR));
    assertEquals(2, catalogDirectoryCount(workspace));
    assertEquals(2, catalogLibraryCount(workspace));

    var upgraded = legacyProfile(first.id(), first.templateCode(), "1.0.1", "legacy_room");
    loader.install(upgraded, Actor.user(ACTOR));
    assertEquals(
        firstDirectory, catalogLibrary(catalog(workspace), "legacy_room").get("directoryCode"));
    assertEquals(2, catalogDirectoryCount(workspace));

    var explicit =
        withCatalog(
            legacyProfile("explicit-profile", "explicit_profile", "explicit_type"),
            new ProfileManifest.CatalogLayout(
                List.of(new ProfileManifest.Directory("explicit-root", "Explicit", null, 10)),
                List.of(new ProfileManifest.Placement("explicit_type", "explicit-root", 10))));
    loader.install(explicit, Actor.user(ACTOR));
    assertOk(
        meta(
            workspace,
            applyProfile(
                workspace, templateId(explicit.templateCode()), 1, "apply-explicit-profile")));
    assertEquals(
        "explicit-root", catalogLibrary(catalog(workspace), "explicit_type").get("directoryCode"));

    var directoryConflict =
        withCatalog(
            legacyProfile(
                "fallback-directory-conflict", "fallback_directory_conflict", "conflict_type"),
            new ProfileManifest.CatalogLayout(
                List.of(
                    new ProfileManifest.Directory((String) firstDirectory, "Conflict", null, 10)),
                List.of()));
    loader.install(directoryConflict, Actor.user(ACTOR));
    var conflict =
        meta(
            workspace,
            applyProfile(
                workspace,
                templateId(directoryConflict.templateCode()),
                1,
                "apply-fallback-directory-conflict"));
    assertCatalogConflict(conflict, (String) firstDirectory, first.templateCode());
  }

  @Test
  void rejectsCrossProfileCatalogIdentityConflictsWithoutChangingExistingMetadata()
      throws Exception {
    var base =
        catalogProfile(
            fixture(),
            "catalog-conflict-base",
            "profile_loader_catalog_conflict_base",
            new ProfileManifest.CatalogLayout(
                List.of(new ProfileManifest.Directory("shared", "Shared", null, 10)),
                List.of(new ProfileManifest.Placement("fixture", "shared", 10))));
    var directoryConflict =
        catalogProfile(
            fixture(),
            "catalog-conflict-directory",
            "profile_loader_catalog_conflict_directory",
            new ProfileManifest.CatalogLayout(
                List.of(
                    new ProfileManifest.Directory("shared", "Conflicting", null, 10),
                    new ProfileManifest.Directory("must-not-exist", "Blocked", null, 20)),
                List.of()));
    loader.install(base, Actor.user(ACTOR));
    loader.install(directoryConflict, Actor.user(ACTOR));

    var directoryWorkspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(
                templateId(base.templateCode()),
                directoryWorkspace,
                "instantiate-directory-conflict")));
    var existingDirectorySource = catalogDirectorySource(directoryWorkspace, "shared");
    var directoryFailure =
        meta(
            directoryWorkspace,
            applyProfile(
                directoryWorkspace,
                templateId(directoryConflict.templateCode()),
                1,
                "apply-directory-conflict"));
    assertCatalogConflict(directoryFailure, "shared", base.templateCode());
    assertEquals(existingDirectorySource, catalogDirectorySource(directoryWorkspace, "shared"));
    assertEquals(1, catalogDirectoryCount(directoryWorkspace));

    var libraryConflict =
        catalogProfile(
            fixture(),
            "catalog-conflict-library",
            "profile_loader_catalog_conflict_library",
            new ProfileManifest.CatalogLayout(
                List.of(new ProfileManifest.Directory("must-not-exist", "Blocked", null, 10)),
                List.of(new ProfileManifest.Placement("fixture", "must-not-exist", 10))));
    loader.install(libraryConflict, Actor.user(ACTOR));
    var libraryWorkspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(
                templateId(base.templateCode()),
                libraryWorkspace,
                "instantiate-library-conflict")));
    var existingLibrarySource = catalogLibrarySource(libraryWorkspace, "fixture");
    var libraryFailure =
        meta(
            libraryWorkspace,
            applyProfile(
                libraryWorkspace,
                templateId(libraryConflict.templateCode()),
                1,
                "apply-library-conflict"));
    assertCatalogConflict(libraryFailure, "fixture", base.templateCode());
    assertEquals(existingLibrarySource, catalogLibrarySource(libraryWorkspace, "fixture"));
    assertEquals(1, catalogDirectoryCount(libraryWorkspace));
  }

  @Test
  void rejectsInvalidCatalogLayoutsWithProfileSpecificDiagnostics() throws Exception {
    var directories = List.of(new ProfileManifest.Directory("root", "Root", null, 0));
    assertCatalogRejected(
        new ProfileManifest.CatalogLayout(
            List.of(
                new ProfileManifest.Directory("root", "Root", null, 0),
                new ProfileManifest.Directory("root", "Duplicate", null, 1)),
            List.of()));
    assertCatalogRejected(
        new ProfileManifest.CatalogLayout(
            List.of(new ProfileManifest.Directory("child", "Child", "missing", 0)), List.of()));
    assertCatalogRejected(
        new ProfileManifest.CatalogLayout(
            List.of(
                new ProfileManifest.Directory("left", "Left", "right", 0),
                new ProfileManifest.Directory("right", "Right", "left", 1)),
            List.of()));
    assertCatalogRejected(
        new ProfileManifest.CatalogLayout(
            directories, List.of(new ProfileManifest.Placement("missing", "root", 0))));
    assertCatalogRejected(
        new ProfileManifest.CatalogLayout(
            directories, List.of(new ProfileManifest.Placement("room", "missing", 0))));
    assertCatalogRejected(
        new ProfileManifest.CatalogLayout(
            directories,
            List.of(
                new ProfileManifest.Placement("room", "root", 0),
                new ProfileManifest.Placement("room", "root", 1))));
  }

  @Test
  void reinstallPublishedProfileAddsMissingManifestFieldsWithoutLosingExistingData()
      throws Exception {
    var base = profileVariant(fixture(), "profile-loader-upgrade", "profile_loader_upgrade");
    loader.install(base, Actor.user(ACTOR));
    var workspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(templateId(base.templateCode()), workspace, "instantiate-upgrade")));
    var roomType = objectType(workspace, "room");
    var room =
        createObject(
            workspace, roomType, "create-upgrade-room", Map.of("name", "lab", "base_score", 4));

    var upgraded =
        new ProfileManifest(
            base.id(),
            base.name(),
            "1.0.1",
            base.templateCode(),
            base.kind(),
            base.sourceProfile(),
            base.targetProfile(),
            base.tags(),
            base.valueTypes(),
            base.objectTypes(),
            markUnique(appendBodyField(base.fields()), "room", "name"),
            base.relations(),
            base.derived(),
            base.rules());
    loader.install(upgraded, Actor.user(ACTOR));

    assertEquals(2, templateVersionCount(base.templateCode()));
    assertTrue(fieldDefExists(templateVersionId(base.templateCode(), 2), "room", "body"));
    assertTrue(fieldUniqueValue(templateVersionId(base.templateCode(), 2), "room", "name"));
    assertOk(meta(workspace, applyTemplateVersion(workspace, 2, "apply-upgrade")));
    assertTrue(runtimeFieldUniqueValue(workspace, "room", "name"));
    assertEquals("lab", fieldValue(room, "name"));
  }

  @Test
  void reinstallWithNewDerivedFieldAndRuleCreatesVersionAndPreservesWorkspaceData()
      throws Exception {
    var base =
        profileVariant(
            fixture(), "profile-loader-derived-upgrade", "profile_loader_derived_upgrade");
    loader.install(base, Actor.user(ACTOR));
    var workspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(
                templateId(base.templateCode()), workspace, "instantiate-derived-upgrade")));
    var roomType = objectType(workspace, "room");
    var room =
        createObject(
            workspace,
            roomType,
            "create-derived-upgrade-room",
            Map.of("name", "lab", "base_score", 4));

    var derived =
        new ProfileManifest.DerivedField(
            "room", "upgrade_score", "Upgrade Score", "number", "self.base_score", "ocl");
    var rule =
        new ProfileManifest.Rule(
            "upgrade_score_high",
            "room",
            null,
            "WARN",
            "self.base_score > 100",
            "ocl",
            "upgrade score high",
            null,
            null,
            null,
            false);
    var upgraded =
        new ProfileManifest(
            base.id(),
            base.name(),
            "1.1.0",
            base.templateCode(),
            base.kind(),
            base.sourceProfile(),
            base.targetProfile(),
            base.tags(),
            base.valueTypes(),
            base.objectTypes(),
            base.fields(),
            base.relations(),
            java.util.stream.Stream.concat(
                    base.derivedOrEmpty().stream(), java.util.stream.Stream.of(derived))
                .toList(),
            java.util.stream.Stream.concat(
                    base.rulesOrEmpty().stream(), java.util.stream.Stream.of(rule))
                .toList());

    loader.install(upgraded, Actor.user(ACTOR));
    assertEquals(2, templateVersionCount(base.templateCode()));
    assertTrue(templateDerivedExists(templateVersionId(base.templateCode(), 2), "upgrade_score"));
    assertTrue(templateRuleExists(templateVersionId(base.templateCode(), 2), "upgrade_score_high"));
    assertEquals("lab", fieldValue(room, "name"));

    assertOk(meta(workspace, applyTemplateVersion(workspace, 2, "apply-derived-upgrade")));
    assertEquals(2, copiedCount("derived_field", workspace));
    assertEquals(2, copiedCount("rule_def", workspace));

    loader.install(upgraded, Actor.user(ACTOR));
    assertEquals(2, templateVersionCount(base.templateCode()));
    assertEquals(2, copiedCount("derived_field", workspace));
    assertEquals(2, copiedCount("rule_def", workspace));
  }

  @Test
  void oclProfileExpressionsRunEquivalentToMExprAfterInstall() {
    var manifest = oclFixture("profile_loader_ocl");
    loader.install(manifest, Actor.user(ACTOR));

    var template = templateId(manifest.templateCode());
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-ocl-profile")));
    var roomType = objectType(workspace, "room");
    var fixtureType = objectType(workspace, "fixture");
    var relationType = relationType(workspace, "contains_fixture");
    var room =
        createObject(
            workspace, roomType, "create-ocl-room", Map.of("name", "lab", "base_score", 0));
    var fixture =
        createObject(
            workspace, fixtureType, "create-ocl-fixture", Map.of("name", "lamp", "load", 7));
    applyEvents(command(workspace, createRelation(workspace, relationType, room, fixture)));

    assertDecimal("7", derivedEvaluator.evaluate(workspace, room, "fixture_load"));
    var runId = runId(rule(workspace, runRuleCheck(workspace, "room", "run-ocl-rules")));
    assertEquals(1, countResults(workspace, runId, "fixture_load_high"));
  }

  @Test
  void oclTypeMismatchFailsDuringProfileInstall() {
    var manifest = oclFixture("profile_loader_ocl_bad");
    var badRule =
        new ProfileManifest.Rule(
            "bad_ocl",
            "room",
            null,
            "WARN",
            "self.contains_fixture->exists(f | f.load and f.name)",
            "ocl",
            "bad",
            null,
            null,
            null,
            false);
    var badManifest =
        new ProfileManifest(
            manifest.id() + "-bad",
            "Bad OCL Profile",
            manifest.version(),
            manifest.templateCode(),
            "domain",
            null,
            null,
            manifest.tags(),
            manifest.valueTypes(),
            manifest.objectTypes(),
            manifest.fields(),
            manifest.relations(),
            manifest.derived(),
            List.of(badRule));

    var failure =
        assertThrows(
            CommandRejectedException.class, () -> loader.install(badManifest, Actor.user(ACTOR)));
    assertEquals("META-400-SCHEMA-INVALID", failure.error().code());
    assertEquals(0, templateCount(badManifest.templateCode()));
  }

  @Test
  void applyProfileAddsSecondProfileToExistingWorkspace() throws Exception {
    var first = fixture();
    var second =
        withCatalog(
            profileVariant(first, "profile-loader-second", "profile_loader_second"),
            emptyCatalog("second-root"));
    loader.install(first, Actor.user(ACTOR));
    loader.install(second, Actor.user(ACTOR));

    var workspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(templateId(first.templateCode()), workspace, "instantiate-base-profile")));
    var secondTemplate = templateId(second.templateCode());
    assertOk(meta(workspace, applyProfile(workspace, secondTemplate, 1, "apply-second-profile")));
    assertOk(
        meta(workspace, applyProfile(workspace, secondTemplate, 1, "apply-second-profile-again")));

    var secondVersion = templateVersionId(second.templateCode(), 1);
    assertEquals(2, workspaceProfileCount(workspace));
    assertEquals(2, objectTypeCount(workspace, "room"));
    var firstRoomType = objectType(workspace, null, "room");
    var secondRoomType = objectType(workspace, secondVersion, "room");
    var firstRoom =
        createObject(
            workspace,
            firstRoomType,
            "create-first-profile-room",
            Map.of("name", "base", "base_score", 2));
    var secondRoom =
        createObject(
            workspace,
            secondRoomType,
            "create-second-profile-room",
            Map.of("name", "addon", "base_score", 3));

    assertObjectType(firstRoom, firstRoomType);
    assertObjectType(secondRoom, secondRoomType);
    var profiles = workspaceProfiles(workspace);
    assertEquals(2, profiles.size(), profiles.toString());
    assertTrue(
        profiles.stream()
            .anyMatch(profile -> first.templateCode().equals(profile.get("templateCode"))));
    assertTrue(
        profiles.stream()
            .anyMatch(profile -> second.templateCode().equals(profile.get("templateCode"))));
  }

  @Test
  void mappingProfileAddsCrossProfileCorrespondenceAndReadEndpoint() throws Exception {
    var source = fixture();
    var target =
        withCatalog(
            profileVariant(source, "profile-loader-target", "profile_loader_target"),
            emptyCatalog("target-root"));
    var mapping = withCatalog(mappingProfile(source, target), emptyCatalog("mapping-root"));
    loader.install(source, Actor.user(ACTOR));
    loader.install(target, Actor.user(ACTOR));
    loader.install(mapping, Actor.user(ACTOR));

    var workspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(templateId(source.templateCode()), workspace, "instantiate-source")));
    assertOk(
        meta(
            workspace,
            applyProfile(workspace, templateId(target.templateCode()), 1, "apply-target")));
    assertOk(
        meta(
            workspace,
            applyProfile(workspace, templateId(mapping.templateCode()), 1, "apply-mapping")));

    var targetVersion = templateVersionId(target.templateCode(), 1);
    var sourceRoom = objectType(workspace, null, "room");
    var targetFixture = objectType(workspace, targetVersion, "fixture");
    assertEquals("correspondence", relationKind(workspace, "maps_fixture"));
    assertEndpoints(workspace, "maps_fixture", sourceRoom, targetFixture);
    assertRejectsDomainCrossProfileRelation(workspace, sourceRoom, targetFixture);

    var room =
        createObject(
            workspace,
            sourceRoom,
            "create-mapping-room",
            Map.of("name", "source", "base_score", 3));
    var fixture =
        createObject(
            workspace,
            targetFixture,
            "create-mapping-fixture",
            Map.of("name", "target", "load", 9));
    var unmappedRoom =
        createObject(
            workspace,
            sourceRoom,
            "create-unmapped-mapping-room",
            Map.of("name", "unmapped", "base_score", 1));
    applyEvents(
        command(
            workspace,
            createRelation(workspace, relationType(workspace, "maps_fixture"), room, fixture)));
    assertOk(meta(workspace, defineMapping(workspace, mapping.templateCode())));

    var definitions = mappingDefinitions(workspace);
    assertEquals(1, definitions.size(), definitions.toString());
    assertEquals("maps_fixture", definitions.getFirst().get("correspondenceRelationCode"));
    assertEquals("one_to_one", firstObjectMapping(definitions).get("cardinality"));
    assertEquals("source_to_target", firstObjectMapping(definitions).get("direction"));

    var correspondences = mappingCorrespondences(workspace);
    assertEquals(1, correspondences.size(), correspondences.toString());
    var correspondence = correspondences.getFirst();
    assertEquals("maps_fixture", correspondence.get("relationType"));
    assertEquals("room", correspondence.get("sourceTypeCode"));
    assertEquals("fixture", correspondence.get("targetTypeCode"));
    assertEquals("one_to_one", correspondence.get("cardinality"));
    assertEquals("source_to_target", correspondence.get("direction"));

    var coverage =
        mappingCoverage(
            workspace,
            UUID.fromString(String.valueOf(correspondence.get("correspondenceId"))),
            0,
            10);
    assertEquals(2L, ((Number) coverage.get("total")).longValue());
    var items = coverageItems(coverage);
    assertEquals(2, items.size(), items.toString());
    assertTrue(items.stream().anyMatch(item -> "mapped".equals(item.get("status"))));
    assertTrue(
        items.stream()
            .anyMatch(
                item ->
                    "unmapped".equals(item.get("status"))
                        && unmappedRoom.toString().equals(item.get("sourceObjectId"))));
    assertTrue(
        items.stream()
            .filter(item -> "mapped".equals(item.get("status")))
            .allMatch(item -> item.get("anchoredSourceVersion") == null));
  }

  private ProfileManifest fixture() throws Exception {
    var resource = new ClassPathResource("profile-loader/minimal-profile.json");
    return mapper.readValue(resource.getInputStream(), ProfileManifest.class);
  }

  private ProfileManifest badFixture() throws Exception {
    var manifest = fixture();
    return new ProfileManifest(
        manifest.id() + "-bad",
        "Bad Profile",
        manifest.version(),
        manifest.templateCode() + "_bad",
        "domain",
        null,
        null,
        manifest.tags(),
        manifest.valueTypes(),
        manifest.objectTypes(),
        List.of(new ProfileManifest.Field("missing", "oops", "Oops", "string", null, true, null)),
        manifest.relations(),
        manifest.derived(),
        manifest.rules());
  }

  private ProfileManifest oclFixture(String templateCode) {
    var values =
        List.of(
            new ProfileManifest.ValueType("score_value", "Score Value", "number", null, null),
            new ProfileManifest.ValueType("load_value", "Load Value", "number", null, null));
    var objectTypes =
        List.of(
            new ProfileManifest.ObjectType("room", "Room", null),
            new ProfileManifest.ObjectType("fixture", "Fixture", null));
    var fields =
        List.of(
            new ProfileManifest.Field("room", "name", "Name", "string", null, true, null),
            new ProfileManifest.Field(
                "room", "base_score", "Base Score", null, "score_value", true, null),
            new ProfileManifest.Field("fixture", "name", "Name", "string", null, true, null),
            new ProfileManifest.Field("fixture", "load", "Load", null, "load_value", true, null));
    var relations =
        List.of(
            new ProfileManifest.Relation(
                "contains_fixture",
                "Contains Fixture",
                "room",
                "fixture",
                "directed",
                "many_to_many",
                "strong",
                false,
                null));
    var derived =
        List.of(
            new ProfileManifest.DerivedField(
                "room",
                "fixture_load",
                "Fixture Load",
                "number",
                "self.contains_fixture->collect(f | f.load)->sum()",
                "ocl"));
    var rules =
        List.of(
            new ProfileManifest.Rule(
                "fixture_load_high",
                "room",
                null,
                "WARN",
                "self.contains_fixture->exists(f | f.load > 5)",
                "ocl",
                "fixture load high",
                null,
                null,
                null,
                false));
    return new ProfileManifest(
        templateCode,
        "OCL Profile",
        "1.0.0",
        templateCode,
        "domain",
        null,
        null,
        null,
        values,
        objectTypes,
        fields,
        relations,
        derived,
        rules);
  }

  private ProfileManifest profileVariant(ProfileManifest manifest, String id, String templateCode) {
    return new ProfileManifest(
        id,
        "Profile Loader Second",
        manifest.version(),
        templateCode,
        "domain",
        null,
        null,
        manifest.tags(),
        manifest.valueTypes(),
        manifest.objectTypes(),
        manifest.fields(),
        manifest.relations(),
        manifest.derived(),
        manifest.rulesOrEmpty().stream()
            .map(
                rule ->
                    new ProfileManifest.Rule(
                        templateCode + "_" + rule.code(),
                        rule.objectType(),
                        rule.field(),
                        rule.severity(),
                        rule.when(),
                        rule.lang(),
                        rule.message(),
                        rule.impact(),
                        rule.suggest(),
                        rule.fix(),
                        rule.lightweight()))
            .toList());
  }

  private ProfileManifest withCatalog(
      ProfileManifest manifest, ProfileManifest.CatalogLayout catalog) {
    return new ProfileManifest(
        manifest.id(),
        manifest.name(),
        manifest.version(),
        manifest.templateCode(),
        manifest.kind(),
        manifest.sourceProfile(),
        manifest.targetProfile(),
        manifest.tags(),
        manifest.valueTypes(),
        manifest.objectTypes(),
        manifest.fields(),
        manifest.relations(),
        manifest.derived(),
        manifest.rules(),
        catalog);
  }

  private ProfileManifest.CatalogLayout emptyCatalog(String directoryCode) {
    return new ProfileManifest.CatalogLayout(
        List.of(new ProfileManifest.Directory(directoryCode, directoryCode, null, 10)), List.of());
  }

  private ProfileManifest legacyProfile(String id, String templateCode, String objectTypeCode) {
    return legacyProfile(id, templateCode, "1.0.0", objectTypeCode);
  }

  private ProfileManifest legacyProfile(
      String id, String templateCode, String version, String objectTypeCode) {
    return new ProfileManifest(
        id,
        "Legacy Profile",
        version,
        templateCode,
        "domain",
        null,
        null,
        null,
        List.of(),
        List.of(new ProfileManifest.ObjectType(objectTypeCode, objectTypeCode, null)),
        List.of(
            new ProfileManifest.Field(objectTypeCode, "name", "Name", "string", null, true, null)),
        List.of(),
        List.of(),
        List.of());
  }

  private ProfileManifest catalogProfile(ProfileManifest manifest, String id, String templateCode) {
    return catalogProfile(
        manifest,
        id,
        templateCode,
        new ProfileManifest.CatalogLayout(
            List.of(
                new ProfileManifest.Directory("root", "Root", null, 10),
                new ProfileManifest.Directory("child", "Child", "root", 20)),
            List.of(
                new ProfileManifest.Placement("fixture", "child", 10),
                new ProfileManifest.Placement("room", "root", 20))));
  }

  private ProfileManifest catalogProfile(
      ProfileManifest manifest,
      String id,
      String templateCode,
      ProfileManifest.CatalogLayout catalog) {
    return new ProfileManifest(
        id,
        "Catalog Profile",
        "1.0.0",
        templateCode,
        "domain",
        null,
        null,
        manifest.tags(),
        manifest.valueTypes(),
        manifest.objectTypes(),
        manifest.fields(),
        manifest.relations(),
        manifest.derived(),
        manifest.rulesOrEmpty().stream()
            .map(
                rule ->
                    new ProfileManifest.Rule(
                        templateCode + "_" + rule.code(),
                        rule.objectType(),
                        rule.field(),
                        rule.severity(),
                        rule.when(),
                        rule.lang(),
                        rule.message(),
                        rule.impact(),
                        rule.suggest(),
                        rule.fix(),
                        rule.lightweight()))
            .toList(),
        catalog);
  }

  private void assertCatalogRejected(ProfileManifest.CatalogLayout catalog) throws Exception {
    var base = fixture();
    var manifest =
        new ProfileManifest(
            base.id() + "-catalog-invalid-" + UUID.randomUUID(),
            "Invalid Catalog",
            base.version(),
            base.templateCode()
                + "_catalog_invalid_"
                + UUID.randomUUID().toString().replace("-", ""),
            "domain",
            null,
            null,
            base.tags(),
            base.valueTypes(),
            base.objectTypes(),
            base.fields(),
            base.relations(),
            base.derived(),
            base.rules(),
            catalog);
    var failure =
        assertThrows(
            CommandRejectedException.class, () -> loader.install(manifest, Actor.user(ACTOR)));
    assertEquals("META-400-SCHEMA-INVALID", failure.error().code());
    assertTrue(failure.error().message().contains(manifest.id()));
  }

  private List<ProfileManifest.Field> appendBodyField(List<ProfileManifest.Field> fields) {
    var values = new java.util.ArrayList<>(fields);
    values.add(new ProfileManifest.Field("room", "body", "正文", "text", null, false, null));
    return values;
  }

  private List<ProfileManifest.Field> markUnique(
      List<ProfileManifest.Field> fields, String objectType, String code) {
    return fields.stream()
        .map(
            field ->
                objectType.equals(field.objectType()) && code.equals(field.code())
                    ? new ProfileManifest.Field(
                        field.objectType(),
                        field.code(),
                        field.name(),
                        field.dataType(),
                        field.valueTypeCode(),
                        field.required(),
                        true,
                        field.constraints())
                    : field)
        .toList();
  }

  private ProfileManifest taggedProfile(
      ProfileManifest manifest,
      String id,
      String templateCode,
      String industry,
      String profession,
      String scenario) {
    return new ProfileManifest(
        id,
        "Profile Loader Tagged",
        manifest.version(),
        templateCode,
        "domain",
        null,
        null,
        new ProfileManifest.Tags(List.of(industry), List.of(profession), List.of(scenario)),
        manifest.valueTypes(),
        manifest.objectTypes(),
        manifest.fields(),
        manifest.relations(),
        manifest.derived(),
        List.of());
  }

  private ProfileManifest mappingProfile(ProfileManifest source, ProfileManifest target) {
    return new ProfileManifest(
        "profile-loader-mapping",
        "Profile Loader Mapping",
        "1.0.0",
        "profile_loader_mapping",
        "mapping",
        source.templateCode(),
        target.templateCode(),
        null,
        List.of(),
        List.of(),
        List.of(),
        List.of(
            new ProfileManifest.Relation(
                "maps_fixture",
                "Maps Fixture",
                "room",
                "fixture",
                "directed",
                "one_to_one",
                "weak",
                false,
                "correspondence")),
        List.of(),
        List.of());
  }

  private Map<String, Object> defineMapping(UUID workspace, String mappingTemplateCode) {
    return metaCommand(
        "DefineTransformation",
        workspace,
        "define-cross-profile-mapping",
        Map.of(
            "templateVersionId",
            templateVersionId(mappingTemplateCode, 1),
            "code",
            "room_to_fixture",
            "name",
            "Room to Fixture",
            "correspondenceRelationCode",
            "maps_fixture",
            "objectMappings",
            List.of(mappingObject()),
            "relationMappings",
            List.of()));
  }

  private Map<String, Object> mappingObject() {
    return Map.of(
        "sourceTypeCode",
        "room",
        "targetTypeCode",
        "fixture",
        "cardinality",
        "one_to_one",
        "direction",
        "source_to_target",
        "fieldMappings",
        List.of(Map.of("targetFieldCode", "name", "expression", "field('name')")));
  }

  private void assertRejectsDomainCrossProfileRelation(
      UUID workspace, UUID sourceType, UUID targetType) {
    var templateVersionId = draftTemplateVersion(workspace, "cross_check_" + shortId(workspace));
    var response =
        meta(
            workspace,
            metaCommand(
                "DefineRelationType",
                workspace,
                "define-bad-domain-cross-profile",
                relationPayload(templateVersionId, sourceType, targetType)));
    assertEquals(400, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("KERNEL-400-SCHEMA-INVALID", errorCode(response));
  }

  private UUID draftTemplateVersion(UUID workspace, String code) {
    var response =
        meta(
            workspace,
            metaCommand(
                "CreateTemplate",
                workspace,
                "create-" + code,
                Map.of("code", code, "name", "Cross Check")));
    assertOk(response);
    return detailUuid(response.getBody(), "templateVersionId");
  }

  private Map<String, Object> relationPayload(
      UUID templateVersionId, UUID sourceType, UUID targetType) {
    return Map.of(
        "templateVersionId",
        templateVersionId,
        "code",
        "bad_cross",
        "name",
        "Bad Cross",
        "sourceTypeId",
        sourceType,
        "targetTypeId",
        targetType,
        "direction",
        "directed",
        "cardinality",
        "one_to_one",
        "semantics",
        "weak");
  }

  private Map<String, Object> instantiate(UUID template, UUID newWorkspace, String key) {
    return metaCommand(
        "InstantiateWorkspace",
        AUTHOR,
        key,
        Map.of(
            "templateId",
            template,
            "version",
            1,
            "newWorkspaceId",
            newWorkspace,
            "workspaceName",
            "Profile Loader Project"));
  }

  private Map<String, Object> applyProfile(UUID workspace, UUID template, int version, String key) {
    return metaCommand(
        "ApplyProfile", workspace, key, Map.of("templateId", template, "version", version));
  }

  private Map<String, Object> applyTemplateVersion(UUID workspace, int version, String key) {
    return metaCommand("ApplyTemplateVersion", workspace, key, Map.of("toVersion", version));
  }

  private Map<String, Object> createObjectCommand(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    return command(
        "CreateObject",
        workspace,
        key,
        Map.of("objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
  }

  private Map<String, Object> createRelation(
      UUID workspace, UUID relationType, UUID source, UUID target) {
    return command(
        "CreateRelation",
        workspace,
        "relate-profile-fixture-" + target.toString().substring(0, 8),
        Map.of(
            "relationTypeId", relationType,
            "sourceId", source,
            "targetId", target,
            "relationFields", Map.of(),
            "source", Map.of("type", "manual")));
  }

  private Map<String, Object> runRuleCheck(UUID workspace, String objectTypeCode, String key) {
    return command(
        "RunRuleCheck", workspace, key, Map.of("scope", Map.of("objectTypeCode", objectTypeCode)));
  }

  private Map<String, Object> metaCommand(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    return envelope(type, workspace, key, payload);
  }

  private Map<String, Object> command(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    return envelope(type, workspace, key, payload);
  }

  private Map<String, Object> envelope(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", workspace);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", key);
    request.put("commandType", type);
    request.put("payload", payload);
    return request;
  }

  private UUID createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    var response = command(workspace, createObjectCommand(workspace, objectType, key, fields));
    assertOk(response);
    applyEvents(response);
    return createdObjectId(response.getBody());
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> command(UUID workspace, Object request) {
    return post(workspace, "/commands", request);
  }

  private ResponseEntity<Map> rule(UUID workspace, Object request) {
    return post(workspace, "/rule-commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", ACTOR);
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + workspace + path,
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private String runId(ResponseEntity<Map> response) {
    assertOk(response);
    return (String) ((List<?>) response.getBody().get("events")).getFirst();
  }

  private UUID createdObjectId(Map<?, ?> body) {
    for (var eventId : (List<?>) body.get("events")) {
      var objectId =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (objectId != null) return UUID.fromString(objectId);
    }
    throw new IllegalStateException("CreateObject did not emit ObjectCreated");
  }

  private UUID detailUuid(Map<?, ?> body, String key) {
    var prefix = key + "=";
    for (var event : (List<?>) body.get("events")) {
      if (event instanceof String text && text.startsWith(prefix)) {
        return UUID.fromString(text.substring(prefix.length()));
      }
    }
    throw new IllegalStateException("命令结果缺少 " + key);
  }

  private String shortId(UUID value) {
    return value.toString().substring(0, 8);
  }

  private void applyEvents(ResponseEntity<Map> response) {
    assertOk(response);
    for (var eventId : (List<?>) response.getBody().get("events")) {
      var payload =
          jdbc.query(
              "SELECT payload::text FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (payload != null) {
        try {
          projection.apply(mapper.readValue(payload, EventEnvelope.class));
        } catch (Exception failure) {
          throw new IllegalStateException("read model projection failed", failure);
        }
      }
    }
  }

  private void assertDecimal(String expected, Object actual) {
    assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) actual));
  }

  private List<String> templateCodes() {
    var response =
        http.getForEntity("http://localhost:" + port + "/views/templates", List.class).getBody();
    return response.stream().map(item -> (String) ((Map<?, ?>) item).get("code")).toList();
  }

  private UUID templateId(String code) {
    return jdbc.queryForObject("SELECT id FROM scene_template WHERE code = ?", UUID.class, code);
  }

  private String templateStatus(String code) {
    return jdbc.queryForObject(
        """
        SELECT version.status
        FROM scene_template template
        JOIN scene_template_version version ON version.template_id = template.id
        WHERE template.code = ?
        ORDER BY version.version DESC
        LIMIT 1
        """,
        String.class,
        code);
  }

  private int templateCount(String code) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM scene_template WHERE code = ?", Integer.class, code);
  }

  private int templateVersionCount(String code) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM scene_template template
        JOIN scene_template_version version ON version.template_id = template.id
        WHERE template.code = ?
        """,
        Integer.class,
        code);
  }

  private int copiedCount(String table, UUID workspace) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM " + table + " WHERE workspace_id = ? AND template_version_id IS NULL",
        Integer.class,
        workspace);
  }

  private UUID objectType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private UUID objectType(UUID workspace, UUID templateVersionId, String code) {
    return jdbc.queryForObject(
        """
        SELECT id FROM object_type
        WHERE workspace_id = ?
          AND template_version_id IS NOT DISTINCT FROM ?
          AND code = ?
        """,
        UUID.class,
        workspace,
        templateVersionId,
        code);
  }

  private int objectTypeCount(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM object_type WHERE workspace_id = ? AND code = ?",
        Integer.class,
        workspace,
        code);
  }

  private int workspaceProfileCount(UUID workspace) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM workspace_profile WHERE workspace_id = ?", Integer.class, workspace);
  }

  private String templateTags(String templateCode) {
    return jdbc.queryForObject(
        """
        SELECT version.tags::text
        FROM scene_template template
        JOIN scene_template_version version ON version.template_id = template.id
        WHERE template.code = ?
        """,
        String.class,
        templateCode);
  }

  private UUID templateVersionId(String templateCode, int version) {
    return jdbc.queryForObject(
        """
        SELECT version.id
        FROM scene_template template
        JOIN scene_template_version version ON version.template_id = template.id
        WHERE template.code = ? AND version.version = ?
        """,
        UUID.class,
        templateCode,
        version);
  }

  private boolean fieldDefExists(UUID templateVersionId, String objectTypeCode, String fieldCode) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS(
              SELECT 1
              FROM field_def field
              JOIN object_type type ON type.id = field.object_type_id
              WHERE type.template_version_id = ?
                AND type.code = ?
                AND field.code = ?
            )
            """,
            Boolean.class,
            templateVersionId,
            objectTypeCode,
            fieldCode));
  }

  private boolean templateDerivedExists(UUID templateVersionId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM derived_field WHERE template_version_id = ? AND code = ?)",
            Boolean.class,
            templateVersionId,
            code));
  }

  private boolean templateRuleExists(UUID templateVersionId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM rule_def WHERE template_version_id = ? AND rule_code = ?)",
            Boolean.class,
            templateVersionId,
            code));
  }

  private boolean fieldUniqueValue(
      UUID templateVersionId, String objectTypeCode, String fieldCode) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT field.unique_value
            FROM field_def field
            JOIN object_type type ON type.id = field.object_type_id
            WHERE field.template_version_id = ? AND type.code = ? AND field.code = ?
            """,
            Boolean.class,
            templateVersionId,
            objectTypeCode,
            fieldCode));
  }

  private boolean runtimeFieldUniqueValue(
      UUID workspaceId, String objectTypeCode, String fieldCode) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT field.unique_value
            FROM field_def field
            JOIN object_type type ON type.id = field.object_type_id
            WHERE type.workspace_id = ? AND type.code = ? AND field.code = ?
            """,
            Boolean.class,
            workspaceId,
            objectTypeCode,
            fieldCode));
  }

  private String fieldValue(UUID objectId, String fieldCode) {
    return jdbc.queryForObject(
        """
        SELECT value.value #>> '{}'
        FROM data_field_value value
        JOIN field_def field ON field.id = value.field_def_id
        WHERE value.object_id = ? AND field.code = ?
        """,
        String.class,
        objectId,
        fieldCode);
  }

  private void assertObjectType(UUID objectId, UUID objectTypeId) {
    assertEquals(
        objectTypeId,
        jdbc.queryForObject(
            "SELECT object_type_id FROM data_object WHERE id = ?", UUID.class, objectId));
  }

  private String relationKind(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT kind FROM relation_type WHERE workspace_id = ? AND code = ?",
        String.class,
        workspace,
        code);
  }

  private void assertEndpoints(UUID workspace, String code, UUID sourceType, UUID targetType) {
    var endpoints =
        jdbc.queryForMap(
            """
            SELECT source_type, target_type FROM relation_type
            WHERE workspace_id = ? AND code = ?
            """,
            workspace,
            code);
    assertEquals(sourceType, endpoints.get("source_type"));
    assertEquals(targetType, endpoints.get("target_type"));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> firstObjectMapping(List<Map<String, Object>> definitions) {
    return (Map<String, Object>)
        ((List<?>) definitions.getFirst().get("objectMappings")).getFirst();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> workspaceProfiles(UUID workspace) {
    var rows =
        http.getForEntity("http://localhost:" + port + "/views/workspaces", Map[].class).getBody();
    for (var row : rows) {
      if (workspace.toString().equals(String.valueOf(row.get("workspaceId")))) {
        return (List<Map<String, Object>>) row.get("profiles");
      }
    }
    return List.of();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> mappingDefinitions(UUID workspace) {
    return http.getForEntity(
            "http://localhost:" + port + "/workspaces/" + workspace + "/views/mapping-profiles",
            List.class)
        .getBody();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> mappingCorrespondences(UUID workspace) {
    return http.getForEntity(
            "http://localhost:"
                + port
                + "/workspaces/"
                + workspace
                + "/views/mapping/correspondences",
            List.class)
        .getBody();
  }

  private Map<String, Object> mappingCoverage(
      UUID workspace, UUID correspondenceId, int page, int size) {
    return http.getForEntity(
            "http://localhost:"
                + port
                + "/workspaces/"
                + workspace
                + "/views/mapping/correspondences/"
                + correspondenceId
                + "/coverage?page="
                + page
                + "&size="
                + size,
            Map.class)
        .getBody();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> coverageItems(Map<String, Object> coverage) {
    return (List<Map<String, Object>>) coverage.get("items");
  }

  private UUID relationType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private int countResults(UUID workspace, String runId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM check_result
        WHERE workspace_id = ? AND run_id = ?::uuid AND rule_code = ?
        """,
        Integer.class,
        workspace,
        runId,
        ruleCode);
  }

  private String ruleStatus(UUID workspace, UUID objectId) {
    var response =
        http.getForEntity(
            "http://localhost:"
                + port
                + "/workspaces/"
                + workspace
                + "/views/rule-status?objectIds="
                + objectId,
            List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (String) ((Map<?, ?>) response.getBody().getFirst()).get("ruleStatus");
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> catalog(UUID workspaceId) {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", ACTOR);
    var response =
        http.exchange(
            "http://localhost:" + port + "/workspaces/" + workspaceId + "/data-catalog",
            org.springframework.http.HttpMethod.GET,
            new HttpEntity<>(headers),
            Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (Map<String, Object>) response.getBody();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> catalogDirectories(Map<String, Object> catalog) {
    return (List<Map<String, Object>>) catalog.get("directories");
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> catalogLibraries(Map<String, Object> catalog) {
    return (List<Map<String, Object>>) catalog.get("libraries");
  }

  private Set<String> catalogObjectTypeCodes(Map<String, Object> catalog) {
    return catalogLibraries(catalog).stream()
        .map(item -> (String) item.get("objectTypeCode"))
        .collect(java.util.stream.Collectors.toSet());
  }

  private Map<String, Object> catalogLibrary(Map<String, Object> catalog, String objectTypeCode) {
    return catalogLibraries(catalog).stream()
        .filter(item -> objectTypeCode.equals(item.get("objectTypeCode")))
        .findFirst()
        .orElseThrow();
  }

  private int catalogDirectoryCount(UUID workspace) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM workspace_catalog_directory WHERE workspace_id = ?",
        Integer.class,
        workspace);
  }

  private int catalogLibraryCount(UUID workspace) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM workspace_catalog_library WHERE workspace_id = ?",
        Integer.class,
        workspace);
  }

  private UUID catalogDirectorySource(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT source_template_version_id FROM workspace_catalog_directory WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private UUID catalogLibrarySource(UUID workspace, String objectTypeCode) {
    return jdbc.queryForObject(
        "SELECT source_template_version_id FROM workspace_catalog_library WHERE workspace_id = ? AND object_type_code = ?",
        UUID.class,
        workspace,
        objectTypeCode);
  }

  private int templateCatalogCount(String table, UUID versionId, String code) {
    var column = table.endsWith("library") ? "object_type_code" : "code";
    return jdbc.queryForObject(
        "SELECT count(*) FROM %s WHERE template_version_id = ? AND %s = ?".formatted(table, column),
        Integer.class,
        versionId,
        code);
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }

  private void assertCatalogConflict(
      ResponseEntity<Map> response, String code, String conflictingTemplateCode) {
    assertEquals(400, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("META-400-SCHEMA-INVALID", errorCode(response));
    var message = (String) ((Map<?, ?>) response.getBody().get("error")).get("message");
    var suggestion = (String) ((Map<?, ?>) response.getBody().get("error")).get("suggestion");
    assertTrue(message.contains(code));
    assertTrue(message.contains(conflictingTemplateCode));
    assertTrue(message.contains("catalog code / objectTypeCode"));
    assertTrue(suggestion.contains("catalog code / objectTypeCode"));
  }
}
