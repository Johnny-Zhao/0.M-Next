package com.mnext.kernel.internal;

import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class MetaModelRepository {
  private final JdbcTemplate jdbc;

  record ObjectTypeRow(UUID id, UUID templateVersionId, UUID parentTypeId, boolean published) {}

  record ValueTypeRow(
      UUID id,
      UUID templateVersionId,
      String code,
      DataType basePrimitive,
      UUID parentValueTypeId,
      FieldConstraints constraints,
      boolean published) {}

  record EffectiveValueType(UUID id, DataType basePrimitive, FieldConstraints constraints) {}

  record TemplateVersion(UUID id, UUID templateId, int version, String status) {}

  record WorkspaceTemplate(UUID templateId, Integer templateVersion) {}

  record ApplyPlan(
      List<AdditiveChange> additiveChanges, List<Map<String, Object>> blockingChanges) {}

  private record AdditiveChange(
      String kind, String objectTypeCode, String fieldCode, String targetCode) {}

  private record TemplateObjectType(String code, String name, String parentCode) {}

  private record TemplateValueType(
      String code,
      String name,
      DataType basePrimitive,
      String parentCode,
      FieldConstraints constraints) {}

  private record TemplateFieldDef(
      String objectTypeCode,
      String code,
      String name,
      boolean required,
      DataType dataType,
      String valueTypeCode,
      FieldConstraints constraints,
      String redefinesFieldCode) {}

  private record TemplateRelationType(
      String code,
      String sourceTypeCode,
      String targetTypeCode,
      String direction,
      String cardinality,
      String semantics,
      boolean hierarchical) {}

  private record CopyValueTypeRow(
      UUID id,
      String code,
      String name,
      String basePrimitive,
      UUID parentValueTypeId,
      String constraintsJson,
      long version) {}

  private record CopyObjectTypeRow(UUID id, String code, String name, UUID parentTypeId) {}

  private record CopyFieldDefRow(
      UUID id,
      UUID objectTypeId,
      String code,
      String name,
      boolean required,
      String dataType,
      UUID valueTypeId,
      String constraintsJson,
      UUID redefinesFieldDefId) {}

  private record CopyRelationTypeRow(
      UUID id,
      String code,
      UUID sourceType,
      UUID targetType,
      String direction,
      String cardinality,
      String semantics,
      boolean hierarchical) {}

  record FieldDefRow(
      UUID id,
      String code,
      boolean required,
      DataType dataType,
      UUID valueTypeId,
      FieldConstraints constraints) {}

  MetaModelRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  boolean templateCodeExists(String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM scene_template WHERE code = ?)", Boolean.class, code));
  }

  boolean templateExists(UUID templateId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM scene_template WHERE id = ?)", Boolean.class, templateId));
  }

  int nextTemplateVersion(UUID templateId) {
    return jdbc.queryForObject(
        "SELECT COALESCE(max(version), 0) + 1 FROM scene_template_version WHERE template_id = ?",
        Integer.class,
        templateId);
  }

  void insertTemplate(UUID id, String code, String name, String actor, Instant now) {
    jdbc.update(
        """
        INSERT INTO scene_template (id, code, name, created_by, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        id,
        code,
        name,
        actor,
        Timestamp.from(now));
  }

  void insertTemplateVersion(UUID id, UUID templateId, int version, String status) {
    jdbc.update(
        """
        INSERT INTO scene_template_version (id, template_id, version, status)
        VALUES (?, ?, ?, ?)
        """,
        id,
        templateId,
        version,
        status);
  }

  Optional<String> templateVersionStatus(UUID templateVersionId) {
    if (templateVersionId == null) return Optional.empty();
    return jdbc.query(
        "SELECT status FROM scene_template_version WHERE id = ?",
        result -> result.next() ? Optional.of(result.getString(1)) : Optional.empty(),
        templateVersionId);
  }

  TemplateVersion templateVersion(UUID templateId, int version) {
    return jdbc.query(
        """
        SELECT id, template_id, version, status
        FROM scene_template_version
        WHERE template_id = ? AND version = ?
        """,
        result ->
            result.next()
                ? new TemplateVersion(
                    result.getObject("id", UUID.class),
                    result.getObject("template_id", UUID.class),
                    result.getInt("version"),
                    result.getString("status"))
                : null,
        templateId,
        version);
  }

  WorkspaceTemplate workspaceTemplate(UUID workspaceId) {
    return jdbc.query(
        """
        SELECT template_id, template_version
        FROM workspace WHERE id = ?
        """,
        result ->
            result.next()
                ? new WorkspaceTemplate(
                    result.getObject("template_id", UUID.class),
                    (Integer) result.getObject("template_version"))
                : null,
        workspaceId);
  }

  long countObjectTypes(UUID templateVersionId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM object_type WHERE template_version_id = ?",
        Long.class,
        templateVersionId);
  }

  long templateTypeCount(UUID templateVersionId) {
    return jdbc.queryForObject(
        """
        SELECT
          (SELECT count(*) FROM value_type WHERE template_version_id = ?)
          + (SELECT count(*) FROM object_type WHERE template_version_id = ?)
          + (SELECT count(*) FROM field_def WHERE template_version_id = ?)
          + (SELECT count(*) FROM relation_type WHERE template_version_id = ?)
        """,
        Long.class,
        templateVersionId,
        templateVersionId,
        templateVersionId,
        templateVersionId);
  }

  void publishTemplateVersion(UUID templateVersionId, String actor, Instant now) {
    jdbc.update(
        """
        UPDATE scene_template_version
        SET status = 'published', published_by = ?, published_at = ?
        WHERE id = ?
        """,
        actor,
        Timestamp.from(now),
        templateVersionId);
  }

  void updateTemplateVersionStatus(UUID templateVersionId, String status) {
    jdbc.update(
        "UPDATE scene_template_version SET status = ? WHERE id = ?", status, templateVersionId);
  }

  void markTemplateTypesPublished(UUID templateVersionId) {
    jdbc.update(
        "UPDATE object_type SET published = TRUE WHERE template_version_id = ?", templateVersionId);
    jdbc.update(
        "UPDATE value_type SET published = TRUE WHERE template_version_id = ?", templateVersionId);
  }

  boolean objectTypeExists(UUID workspaceId, UUID objectTypeId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM object_type WHERE workspace_id = ? AND id = ?)",
            Boolean.class,
            workspaceId,
            objectTypeId));
  }

  boolean objectTypeCodeExists(UUID workspaceId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM object_type WHERE workspace_id = ? AND code = ?)",
            Boolean.class,
            workspaceId,
            code));
  }

  boolean objectTypeCodeExists(UUID workspaceId, UUID templateVersionId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS(
              SELECT 1 FROM object_type
              WHERE workspace_id = ?
                AND template_version_id IS NOT DISTINCT FROM ?
                AND code = ?
            )
            """,
            Boolean.class,
            workspaceId,
            templateVersionId,
            code));
  }

  Optional<ObjectTypeRow> objectTypeByCode(UUID workspaceId, String code) {
    return jdbc.query(
        """
        SELECT id, template_version_id, parent_type_id, published
        FROM object_type WHERE workspace_id = ? AND code = ?
        """,
        result -> result.next() ? Optional.of(objectTypeRow(result)) : Optional.empty(),
        workspaceId,
        code);
  }

  Optional<ObjectTypeRow> objectTypeByCode(UUID workspaceId, UUID templateVersionId, String code) {
    return jdbc.query(
        """
        SELECT id, template_version_id, parent_type_id, published
        FROM object_type
        WHERE workspace_id = ?
          AND template_version_id IS NOT DISTINCT FROM ?
          AND code = ?
        """,
        result -> result.next() ? Optional.of(objectTypeRow(result)) : Optional.empty(),
        workspaceId,
        templateVersionId,
        code);
  }

  Optional<ObjectTypeRow> objectTypeById(UUID workspaceId, UUID objectTypeId) {
    return jdbc.query(
        """
        SELECT id, template_version_id, parent_type_id, published
        FROM object_type WHERE workspace_id = ? AND id = ?
        """,
        result -> result.next() ? Optional.of(objectTypeRow(result)) : Optional.empty(),
        workspaceId,
        objectTypeId);
  }

  Optional<UUID> objectTypeTemplateVersion(UUID workspaceId, UUID objectTypeId) {
    return jdbc.query(
        """
        SELECT template_version_id FROM object_type
        WHERE workspace_id = ? AND id = ?
        """,
        result -> result.next() ? Optional.ofNullable(result.getObject(1, UUID.class)) : null,
        workspaceId,
        objectTypeId);
  }

  boolean objectTypeDescendsFrom(UUID workspaceId, UUID actualTypeId, UUID expectedTypeId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            WITH RECURSIVE ancestors AS (
              SELECT id, parent_type_id FROM object_type
              WHERE workspace_id = ? AND id = ?
              UNION ALL
              SELECT parent.id, parent.parent_type_id
              FROM object_type parent
              JOIN ancestors child ON parent.id = child.parent_type_id
              WHERE parent.workspace_id = ?
            )
            SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = ?)
            """,
            Boolean.class,
            workspaceId,
            actualTypeId,
            workspaceId,
            expectedTypeId));
  }

  boolean objectTypeCodeDescendsFrom(UUID workspaceId, String actualCode, String expectedCode) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            WITH RECURSIVE ancestors AS (
              SELECT id, code, parent_type_id FROM object_type
              WHERE workspace_id = ? AND code = ?
              UNION ALL
              SELECT parent.id, parent.code, parent.parent_type_id
              FROM object_type parent
              JOIN ancestors child ON parent.id = child.parent_type_id
              WHERE parent.workspace_id = ?
            )
            SELECT EXISTS(SELECT 1 FROM ancestors WHERE code = ?)
            """,
            Boolean.class,
            workspaceId,
            actualCode,
            workspaceId,
            expectedCode));
  }

  boolean fieldCodeExists(UUID objectTypeId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM field_def WHERE object_type_id = ? AND code = ?)",
            Boolean.class,
            objectTypeId,
            code));
  }

  boolean relationTypeCodeExists(UUID workspaceId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM relation_type WHERE workspace_id = ? AND code = ?)",
            Boolean.class,
            workspaceId,
            code));
  }

  boolean relationTypeCodeExists(UUID workspaceId, UUID templateVersionId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS(
              SELECT 1 FROM relation_type
              WHERE workspace_id = ?
                AND template_version_id IS NOT DISTINCT FROM ?
                AND code = ?
            )
            """,
            Boolean.class,
            workspaceId,
            templateVersionId,
            code));
  }

  void insertObjectType(
      UUID id,
      UUID workspaceId,
      UUID templateVersionId,
      String code,
      String name,
      UUID parentTypeId,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, template_version_id, code, name, parent_type_id, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?)
        """,
        id,
        workspaceId,
        templateVersionId,
        code,
        name,
        parentTypeId,
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
  }

  void updateObjectType(UUID id, String name, UUID parentTypeId, String actor, Instant now) {
    jdbc.update(
        """
        UPDATE object_type
        SET name = ?, parent_type_id = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
        """,
        name,
        parentTypeId,
        actor,
        Timestamp.from(now),
        id);
  }

  void insertFieldDef(
      UUID id,
      UUID objectTypeId,
      UUID templateVersionId,
      String code,
      String name,
      DataType dataType,
      UUID valueTypeId,
      boolean required,
      FieldConstraints constraints,
      UUID redefinesFieldDefId,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, template_version_id, code, name, required, data_type,
           value_type_id, constraints, redefines_field_def_id, created_by, updated_by, created_at,
           updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?, ?)
        """,
        id,
        objectTypeId,
        templateVersionId,
        code,
        name,
        required,
        dataType.code(),
        valueTypeId,
        JsonCodec.encode(constraints.asMap()),
        redefinesFieldDefId,
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
  }

  Optional<FieldDefRow> ancestorFieldByCode(UUID objectTypeId, String code) {
    return jdbc.query(
        """
        WITH RECURSIVE ancestors AS (
          SELECT parent.id, parent.parent_type_id, 1 AS depth
          FROM object_type child
          JOIN object_type parent ON parent.id = child.parent_type_id
          WHERE child.id = ?
          UNION ALL
          SELECT parent.id, parent.parent_type_id, child.depth + 1
          FROM object_type parent
          JOIN ancestors child ON parent.id = child.parent_type_id
          WHERE child.depth < 32
        )
        SELECT field.id, field.code, field.required, field.data_type, field.value_type_id,
          field.constraints->>'minLength' AS min_length,
          field.constraints->>'maxLength' AS max_length,
          field.constraints->>'min' AS min_value,
          field.constraints->>'max' AS max_value,
          field.constraints->>'pattern' AS pattern,
          field.constraints->>'refObjectTypeCode' AS ref_type,
          field.constraints->>'multiline' AS multiline,
          ARRAY(SELECT jsonb_array_elements_text(
            COALESCE(field.constraints->'enumValues', '[]'::jsonb))) AS enum_values
        FROM ancestors
        JOIN field_def field ON field.object_type_id = ancestors.id
        WHERE field.code = ?
        ORDER BY ancestors.depth ASC
        LIMIT 1
        """,
        result -> result.next() ? Optional.of(fieldDefRow(result)) : Optional.empty(),
        objectTypeId,
        code);
  }

  Optional<ValueTypeRow> valueTypeByCode(UUID workspaceId, String code) {
    return jdbc.query(
        """
        SELECT id, template_version_id, code, base_primitive, parent_value_type_id,
          constraints->>'minLength' AS min_length, constraints->>'maxLength' AS max_length,
          constraints->>'min' AS min_value, constraints->>'max' AS max_value,
          constraints->>'pattern' AS pattern, constraints->>'refObjectTypeCode' AS ref_type,
          constraints->>'multiline' AS multiline,
          ARRAY(SELECT jsonb_array_elements_text(
            COALESCE(constraints->'enumValues', '[]'::jsonb))) AS enum_values,
          published
        FROM value_type WHERE workspace_id = ? AND code = ?
        """,
        result -> result.next() ? Optional.of(valueTypeRow(result)) : Optional.empty(),
        workspaceId,
        code);
  }

  Optional<ValueTypeRow> valueTypeByCode(UUID workspaceId, UUID templateVersionId, String code) {
    return jdbc.query(
        """
        SELECT id, template_version_id, code, base_primitive, parent_value_type_id,
          constraints->>'minLength' AS min_length, constraints->>'maxLength' AS max_length,
          constraints->>'min' AS min_value, constraints->>'max' AS max_value,
          constraints->>'pattern' AS pattern, constraints->>'refObjectTypeCode' AS ref_type,
          constraints->>'multiline' AS multiline,
          ARRAY(SELECT jsonb_array_elements_text(
            COALESCE(constraints->'enumValues', '[]'::jsonb))) AS enum_values,
          published
        FROM value_type
        WHERE workspace_id = ?
          AND template_version_id IS NOT DISTINCT FROM ?
          AND code = ?
        """,
        result -> result.next() ? Optional.of(valueTypeRow(result)) : Optional.empty(),
        workspaceId,
        templateVersionId,
        code);
  }

  boolean valueTypeCodeExists(UUID workspaceId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM value_type WHERE workspace_id = ? AND code = ?)",
            Boolean.class,
            workspaceId,
            code));
  }

  boolean valueTypeCodeExists(UUID workspaceId, UUID templateVersionId, String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            SELECT EXISTS(
              SELECT 1 FROM value_type
              WHERE workspace_id = ?
                AND template_version_id IS NOT DISTINCT FROM ?
                AND code = ?
            )
            """,
            Boolean.class,
            workspaceId,
            templateVersionId,
            code));
  }

  boolean valueTypeDescendsFrom(UUID actualValueTypeId, UUID expectedValueTypeId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
            WITH RECURSIVE ancestors AS (
              SELECT id, parent_value_type_id FROM value_type WHERE id = ?
              UNION ALL
              SELECT parent.id, parent.parent_value_type_id
              FROM value_type parent
              JOIN ancestors child ON parent.id = child.parent_value_type_id
            )
            SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = ?)
            """,
            Boolean.class,
            actualValueTypeId,
            expectedValueTypeId));
  }

  void insertValueType(
      UUID id,
      UUID workspaceId,
      UUID templateVersionId,
      String code,
      String name,
      DataType basePrimitive,
      UUID parentValueTypeId,
      FieldConstraints constraints,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO value_type
          (id, workspace_id, template_version_id, code, name, base_primitive,
           parent_value_type_id, constraints, published, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), FALSE, 1)
        """,
        id,
        workspaceId,
        templateVersionId,
        code,
        name,
        basePrimitive.code(),
        parentValueTypeId,
        JsonCodec.encode(constraints.asMap()));
  }

  void updateValueType(
      UUID id, String name, UUID parentValueTypeId, FieldConstraints constraints, Instant now) {
    jdbc.update(
        """
        UPDATE value_type
        SET name = ?, parent_value_type_id = ?, constraints = CAST(? AS jsonb), version = version + 1
        WHERE id = ?
        """,
        name,
        parentValueTypeId,
        JsonCodec.encode(constraints.asMap()),
        id);
  }

  EffectiveValueType resolveEffectiveValueType(UUID valueTypeId) {
    var chain = valueTypeChain(valueTypeId);
    if (chain.isEmpty()) throw CommandErrors.metaParentNotFound();
    var constraints = FieldConstraints.empty();
    for (var valueType : chain) {
      constraints = mergeConstraints(constraints, valueType.constraints());
    }
    var leaf = chain.get(chain.size() - 1);
    return new EffectiveValueType(leaf.id(), leaf.basePrimitive(), constraints);
  }

  LinkedHashMap<String, FieldDefinition> resolveEffectiveFields(UUID objectTypeId) {
    var definitions = new LinkedHashMap<String, FieldDefinition>();
    jdbc.query(
        """
        WITH RECURSIVE type_chain AS (
          SELECT id, parent_type_id, 0 AS depth FROM object_type WHERE id = ?
          UNION ALL
          SELECT parent.id, parent.parent_type_id, child.depth + 1
          FROM object_type parent
          JOIN type_chain child ON parent.id = child.parent_type_id
          WHERE child.depth < 32
        )
        SELECT field.id, field.code, field.required, field.data_type, field.value_type_id,
          field.constraints->>'minLength' AS min_length,
          field.constraints->>'maxLength' AS max_length,
          field.constraints->>'min' AS min_value,
          field.constraints->>'max' AS max_value,
          field.constraints->>'pattern' AS pattern,
          field.constraints->>'refObjectTypeCode' AS ref_type,
          field.constraints->>'multiline' AS multiline,
          ARRAY(SELECT jsonb_array_elements_text(
            COALESCE(field.constraints->'enumValues', '[]'::jsonb))) AS enum_values
        FROM type_chain
        JOIN field_def field ON field.object_type_id = type_chain.id
        ORDER BY type_chain.depth DESC, field.code
        """,
        result -> {
          var local = constraints(result);
          var valueTypeId = result.getObject("value_type_id", UUID.class);
          var dataType = DataType.fromCode(result.getString("data_type"));
          var effective = local;
          if (valueTypeId != null) {
            var valueType = resolveEffectiveValueType(valueTypeId);
            dataType = valueType.basePrimitive();
            effective = mergeConstraints(valueType.constraints(), local);
          }
          definitions.put(
              result.getString("code"),
              new FieldDefinition(
                  result.getObject("id", UUID.class),
                  result.getString("code"),
                  result.getBoolean("required"),
                  dataType,
                  effective));
        },
        objectTypeId);
    return definitions;
  }

  List<String> narrowingViolations(
      UUID workspaceId, FieldConstraints parent, FieldConstraints child) {
    var violations = new ArrayList<String>();
    if (parent.maxLength() != null
        && child.maxLength() != null
        && child.maxLength() > parent.maxLength()) {
      violations.add("maxLength");
    }
    if (parent.minLength() != null
        && child.minLength() != null
        && child.minLength() < parent.minLength()) {
      violations.add("minLength");
    }
    if (parent.min() != null && child.min() != null && child.min().compareTo(parent.min()) < 0) {
      violations.add("min");
    }
    if (parent.max() != null && child.max() != null && child.max().compareTo(parent.max()) > 0) {
      violations.add("max");
    }
    if (parent.enumValues() != null
        && child.enumValues() != null
        && !parent.enumValues().containsAll(child.enumValues())) {
      violations.add("enumValues");
    }
    if (parent.refObjectTypeCode() != null && child.refObjectTypeCode() != null) {
      if (!objectTypeCodeDescendsFrom(
          workspaceId, child.refObjectTypeCode(), parent.refObjectTypeCode())) {
        violations.add("refObjectTypeCode");
      }
    }
    return violations;
  }

  static FieldConstraints mergeConstraints(FieldConstraints parent, FieldConstraints child) {
    return new FieldConstraints(
        child.minLength() != null ? child.minLength() : parent.minLength(),
        child.maxLength() != null ? child.maxLength() : parent.maxLength(),
        child.min() != null ? child.min() : parent.min(),
        child.max() != null ? child.max() : parent.max(),
        child.pattern() != null ? child.pattern() : parent.pattern(),
        child.enumValues() != null ? child.enumValues() : parent.enumValues(),
        child.refObjectTypeCode() != null ? child.refObjectTypeCode() : parent.refObjectTypeCode(),
        child.multiline() != null ? child.multiline() : parent.multiline());
  }

  void insertRelationType(
      UUID id,
      UUID workspaceId,
      UUID templateVersionId,
      String code,
      UUID sourceTypeId,
      UUID targetTypeId,
      String direction,
      String cardinality,
      String semantics,
      boolean hierarchical,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO relation_type
          (id, workspace_id, template_version_id, code, source_type, target_type, direction,
           cardinality, semantics, hierarchical, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        id,
        workspaceId,
        templateVersionId,
        code,
        sourceTypeId,
        targetTypeId,
        direction,
        cardinality,
        semantics,
        hierarchical,
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
  }

  void instantiateTemplateVersion(
      UUID templateVersionId,
      UUID sourceWorkspaceId,
      UUID targetWorkspaceId,
      String actor,
      Instant now) {
    var valueTypeIds = new HashMap<UUID, UUID>();
    var objectTypeIds = new HashMap<UUID, UUID>();
    var fieldDefIds = new HashMap<UUID, UUID>();
    seedRootValueTypes(sourceWorkspaceId, targetWorkspaceId, actor, now, valueTypeIds);
    copyValueTypes(templateVersionId, targetWorkspaceId, actor, now, valueTypeIds);
    copyObjectTypes(templateVersionId, targetWorkspaceId, actor, now, objectTypeIds);
    copyFieldDefs(templateVersionId, actor, now, valueTypeIds, objectTypeIds, fieldDefIds);
    copyRelationTypes(templateVersionId, targetWorkspaceId, actor, now, objectTypeIds);
  }

  ApplyPlan planTemplateVersionApply(
      UUID workspaceId, UUID fromTemplateVersionId, UUID toTemplateVersionId) {
    var blocking = new ArrayList<Map<String, Object>>();
    var additive = new ArrayList<AdditiveChange>();
    var fromObjects = templateObjectTypes(fromTemplateVersionId);
    var toObjects = templateObjectTypes(toTemplateVersionId);
    var fromValues = templateValueTypes(fromTemplateVersionId);
    var toValues = templateValueTypes(toTemplateVersionId);
    var fromFields = templateFieldDefs(fromTemplateVersionId);
    var toFields = templateFieldDefs(toTemplateVersionId);
    var fromRelations = templateRelationTypes(fromTemplateVersionId);
    var toRelations = templateRelationTypes(toTemplateVersionId);
    compareObjectTypes(workspaceId, fromObjects, toObjects, additive, blocking);
    compareValueTypes(workspaceId, fromValues, toValues, additive, blocking);
    compareFieldDefs(workspaceId, fromObjects, toObjects, fromFields, toFields, additive, blocking);
    compareRelationTypes(workspaceId, fromRelations, toRelations, additive, blocking);
    return new ApplyPlan(additive, blocking);
  }

  void applyTemplateVersion(
      UUID workspaceId,
      UUID toTemplateVersionId,
      int toVersion,
      String actor,
      Instant now,
      ApplyPlan plan) {
    var toObjects = templateObjectTypes(toTemplateVersionId);
    var toValues = templateValueTypes(toTemplateVersionId);
    var toFields = templateFieldDefs(toTemplateVersionId);
    var toRelations = templateRelationTypes(toTemplateVersionId);
    for (var change : plan.additiveChanges()) {
      if ("value".equals(change.kind())) {
        ensureRuntimeValueType(workspaceId, change.targetCode(), toValues, actor, now);
      } else if ("object".equals(change.kind())) {
        ensureRuntimeObjectType(workspaceId, change.objectTypeCode(), toObjects, actor, now);
      } else if ("field".equals(change.kind())) {
        insertRuntimeField(
            workspaceId,
            change.objectTypeCode(),
            change.fieldCode(),
            toObjects,
            toValues,
            toFields,
            actor,
            now);
      } else if ("fieldConstraints".equals(change.kind())) {
        updateRuntimeField(
            workspaceId,
            change.objectTypeCode(),
            change.fieldCode(),
            toFields,
            toValues,
            actor,
            now);
      } else if ("valueConstraints".equals(change.kind())) {
        updateRuntimeValueType(workspaceId, change.targetCode(), toValues, actor, now);
      } else if ("relation".equals(change.kind())) {
        insertRuntimeRelationType(
            workspaceId, change.targetCode(), toObjects, toRelations, actor, now);
      } else {
        throw CommandErrors.schema("未知模板演化操作");
      }
    }
    jdbc.update(
        """
        UPDATE workspace SET template_version = ?
        WHERE id = ?
        """,
        toVersion,
        workspaceId);
  }

  private void compareObjectTypes(
      UUID workspaceId,
      Map<String, TemplateObjectType> from,
      Map<String, TemplateObjectType> to,
      List<AdditiveChange> additive,
      List<Map<String, Object>> blocking) {
    for (var entry : from.entrySet()) {
      var next = to.get(entry.getKey());
      if (next == null) {
        blocking.addAll(affectedObjects(workspaceId, entry.getKey(), null, "objectTypeDeleted"));
      } else if (!same(entry.getValue().parentCode(), next.parentCode())) {
        blocking.addAll(affectedObjects(workspaceId, entry.getKey(), null, "parentTypeChanged"));
      }
    }
    for (var entry : to.entrySet()) {
      if (!from.containsKey(entry.getKey())) {
        additive.add(new AdditiveChange("object", entry.getKey(), null, null));
      }
    }
  }

  private void compareValueTypes(
      UUID workspaceId,
      Map<String, TemplateValueType> from,
      Map<String, TemplateValueType> to,
      List<AdditiveChange> additive,
      List<Map<String, Object>> blocking) {
    for (var entry : from.entrySet()) {
      var next = to.get(entry.getKey());
      if (next == null) {
        blocking.add(blocking("valueTypeDeleted", null, entry.getKey()));
      } else if (entry.getValue().basePrimitive() != next.basePrimitive()
          || !same(entry.getValue().parentCode(), next.parentCode())) {
        blocking.add(blocking("valueTypeChangedRequiresReview", null, entry.getKey()));
      } else if (!same(entry.getValue().constraints(), next.constraints())) {
        if (constraintsRelaxed(workspaceId, entry.getValue().constraints(), next.constraints())) {
          additive.add(new AdditiveChange("valueConstraints", null, null, entry.getKey()));
        } else {
          blocking.add(blocking("valueTypeChangedRequiresReview", null, entry.getKey()));
        }
      }
    }
    for (var entry : to.entrySet()) {
      if (!from.containsKey(entry.getKey())) {
        additive.add(new AdditiveChange("value", null, null, entry.getKey()));
      }
    }
  }

  private void compareFieldDefs(
      UUID workspaceId,
      Map<String, TemplateObjectType> fromObjects,
      Map<String, TemplateObjectType> toObjects,
      Map<String, TemplateFieldDef> from,
      Map<String, TemplateFieldDef> to,
      List<AdditiveChange> additive,
      List<Map<String, Object>> blocking) {
    for (var entry : from.entrySet()) {
      var current = entry.getValue();
      var next = to.get(entry.getKey());
      if (next == null) {
        blocking.addAll(
            affectedObjects(workspaceId, current.objectTypeCode(), current.code(), "fieldDeleted"));
      } else {
        compareExistingField(workspaceId, current, next, toObjects, to, additive, blocking);
      }
    }
    for (var entry : to.entrySet()) {
      if (!from.containsKey(entry.getKey())) {
        var next = entry.getValue();
        if (next.required() && fromObjects.containsKey(next.objectTypeCode())) {
          blocking.addAll(
              affectedObjects(workspaceId, next.objectTypeCode(), next.code(), "newRequiredField"));
        } else if (toObjects.containsKey(next.objectTypeCode())) {
          additive.add(new AdditiveChange("field", next.objectTypeCode(), next.code(), null));
        }
      }
    }
  }

  private void compareExistingField(
      UUID workspaceId,
      TemplateFieldDef current,
      TemplateFieldDef next,
      Map<String, TemplateObjectType> toObjects,
      Map<String, TemplateFieldDef> toFields,
      List<AdditiveChange> additive,
      List<Map<String, Object>> blocking) {
    if (current.dataType() != next.dataType()) {
      blocking.addAll(
          affectedObjects(
              workspaceId, current.objectTypeCode(), current.code(), "dataTypeChanged"));
      return;
    }
    if (!same(current.valueTypeCode(), next.valueTypeCode())) {
      blocking.addAll(
          affectedObjects(
              workspaceId, current.objectTypeCode(), current.code(), "valueTypeChanged"));
      return;
    }
    if (!same(current.redefinesFieldCode(), next.redefinesFieldCode())) {
      blocking.addAll(
          affectedObjects(
              workspaceId, current.objectTypeCode(), current.code(), "redefinitionChanged"));
      return;
    }
    if (!current.required() && next.required()) {
      blocking.addAll(
          affectedObjects(
              workspaceId, current.objectTypeCode(), current.code(), "newRequiredField"));
      return;
    }
    if (next.redefinesFieldCode() != null
        && !validRedefinitionConstraints(next, toObjects, toFields)) {
      blocking.addAll(
          affectedObjects(
              workspaceId, current.objectTypeCode(), current.code(), "redefinitionChanged"));
      return;
    }
    if (same(current.constraints(), next.constraints()) && current.required() == next.required()) {
      return;
    }
    if ((current.required() || !next.required())
        && constraintsRelaxed(workspaceId, current.constraints(), next.constraints())) {
      additive.add(
          new AdditiveChange("fieldConstraints", next.objectTypeCode(), next.code(), null));
    } else {
      blocking.addAll(
          affectedObjects(
              workspaceId, current.objectTypeCode(), current.code(), "fieldConstraintChanged"));
    }
  }

  private void compareRelationTypes(
      UUID workspaceId,
      Map<String, TemplateRelationType> from,
      Map<String, TemplateRelationType> to,
      List<AdditiveChange> additive,
      List<Map<String, Object>> blocking) {
    for (var entry : from.entrySet()) {
      var next = to.get(entry.getKey());
      if (next == null || !same(entry.getValue(), next)) {
        blocking.add(blocking("relationTypeChangedRequiresReview", null, entry.getKey()));
      }
    }
    for (var entry : to.entrySet()) {
      if (!from.containsKey(entry.getKey())) {
        additive.add(new AdditiveChange("relation", null, null, entry.getKey()));
      }
    }
  }

  private UUID ensureRuntimeObjectType(
      UUID workspaceId,
      String code,
      Map<String, TemplateObjectType> toObjects,
      String actor,
      Instant now) {
    var existing = runtimeObjectTypeId(workspaceId, code);
    if (existing != null) return existing;
    var template = toObjects.get(code);
    if (template == null) throw CommandErrors.schema("模板对象类型引用不完整");
    var parentId =
        template.parentCode() == null
            ? null
            : ensureRuntimeObjectType(workspaceId, template.parentCode(), toObjects, actor, now);
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, template_version_id, code, name, parent_type_id, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?, ?, TRUE, ?, ?, ?, ?)
        """,
        id,
        workspaceId,
        template.code(),
        template.name(),
        parentId,
        actor,
        actor,
        Timestamp.from(now),
        Timestamp.from(now));
    return id;
  }

  private UUID ensureRuntimeValueType(
      UUID workspaceId,
      String code,
      Map<String, TemplateValueType> toValues,
      String actor,
      Instant now) {
    var existing = runtimeValueTypeId(workspaceId, code);
    if (existing != null) return existing;
    var template = toValues.get(code);
    if (template == null) throw CommandErrors.schema("模板值类型引用不完整");
    var parentId =
        template.parentCode() == null
            ? null
            : ensureRuntimeValueType(workspaceId, template.parentCode(), toValues, actor, now);
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO value_type
          (id, workspace_id, template_version_id, code, name, base_primitive,
           parent_value_type_id, constraints, published, version)
        VALUES (?, ?, NULL, ?, ?, ?, ?, CAST(? AS jsonb), TRUE, 1)
        """,
        id,
        workspaceId,
        template.code(),
        template.name(),
        template.basePrimitive().code(),
        parentId,
        JsonCodec.encode(template.constraints().asMap()));
    return id;
  }

  private void insertRuntimeField(
      UUID workspaceId,
      String objectTypeCode,
      String fieldCode,
      Map<String, TemplateObjectType> toObjects,
      Map<String, TemplateValueType> toValues,
      Map<String, TemplateFieldDef> toFields,
      String actor,
      Instant now) {
    var field = toFields.get(fieldKey(objectTypeCode, fieldCode));
    if (field == null) throw CommandErrors.schema("模板字段引用不完整");
    var objectTypeId = ensureRuntimeObjectType(workspaceId, objectTypeCode, toObjects, actor, now);
    var valueTypeId =
        field.valueTypeCode() == null
            ? null
            : ensureRuntimeValueType(workspaceId, field.valueTypeCode(), toValues, actor, now);
    var redefinesId = runtimeRedefinedFieldId(objectTypeId, field.redefinesFieldCode());
    insertFieldDef(
        UUID.randomUUID(),
        objectTypeId,
        null,
        field.code(),
        field.name(),
        field.dataType(),
        valueTypeId,
        field.required(),
        field.constraints(),
        redefinesId,
        actor,
        now);
  }

  private void updateRuntimeField(
      UUID workspaceId,
      String objectTypeCode,
      String fieldCode,
      Map<String, TemplateFieldDef> toFields,
      Map<String, TemplateValueType> toValues,
      String actor,
      Instant now) {
    var field = toFields.get(fieldKey(objectTypeCode, fieldCode));
    if (field == null) throw CommandErrors.schema("模板字段引用不完整");
    var valueTypeId =
        field.valueTypeCode() == null
            ? null
            : ensureRuntimeValueType(workspaceId, field.valueTypeCode(), toValues, actor, now);
    jdbc.update(
        """
        UPDATE field_def field
        SET required = ?, value_type_id = ?, constraints = CAST(? AS jsonb),
          updated_by = ?, updated_at = ?
        FROM object_type type
        WHERE field.object_type_id = type.id
          AND type.workspace_id = ?
          AND type.code = ?
          AND field.code = ?
        """,
        field.required(),
        valueTypeId,
        JsonCodec.encode(field.constraints().asMap()),
        actor,
        Timestamp.from(now),
        workspaceId,
        objectTypeCode,
        fieldCode);
  }

  private void updateRuntimeValueType(
      UUID workspaceId,
      String code,
      Map<String, TemplateValueType> toValues,
      String actor,
      Instant now) {
    var value = toValues.get(code);
    if (value == null) throw CommandErrors.schema("模板值类型引用不完整");
    var parentId =
        value.parentCode() == null
            ? null
            : ensureRuntimeValueType(workspaceId, value.parentCode(), toValues, actor, now);
    jdbc.update(
        """
        UPDATE value_type
        SET name = ?, parent_value_type_id = ?, constraints = CAST(? AS jsonb),
          version = version + 1
        WHERE workspace_id = ? AND code = ?
        """,
        value.name(),
        parentId,
        JsonCodec.encode(value.constraints().asMap()),
        workspaceId,
        code);
  }

  private void insertRuntimeRelationType(
      UUID workspaceId,
      String code,
      Map<String, TemplateObjectType> toObjects,
      Map<String, TemplateRelationType> toRelations,
      String actor,
      Instant now) {
    if (relationTypeCodeExists(workspaceId, code)) return;
    var relation = toRelations.get(code);
    if (relation == null) throw CommandErrors.schema("模板关系类型引用不完整");
    insertRelationType(
        UUID.randomUUID(),
        workspaceId,
        null,
        relation.code(),
        ensureRuntimeObjectType(workspaceId, relation.sourceTypeCode(), toObjects, actor, now),
        ensureRuntimeObjectType(workspaceId, relation.targetTypeCode(), toObjects, actor, now),
        relation.direction(),
        relation.cardinality(),
        relation.semantics(),
        relation.hierarchical(),
        actor,
        now);
  }

  private Map<String, TemplateObjectType> templateObjectTypes(UUID templateVersionId) {
    var values = new LinkedHashMap<String, TemplateObjectType>();
    var rows =
        jdbc.query(
            """
            SELECT type.code, type.name, parent.code AS parent_code
            FROM object_type type
            LEFT JOIN object_type parent ON parent.id = type.parent_type_id
            WHERE type.template_version_id = ?
            ORDER BY type.code
            """,
            (result, ignored) ->
                new TemplateObjectType(
                    result.getString("code"),
                    result.getString("name"),
                    result.getString("parent_code")),
            templateVersionId);
    for (var row : rows) values.put(row.code(), row);
    return values;
  }

  private Map<String, TemplateValueType> templateValueTypes(UUID templateVersionId) {
    var values = new LinkedHashMap<String, TemplateValueType>();
    var rows =
        jdbc.query(
            """
            SELECT value.code, value.name, value.base_primitive, parent.code AS parent_code,
              value.constraints->>'minLength' AS min_length,
              value.constraints->>'maxLength' AS max_length,
              value.constraints->>'min' AS min_value,
              value.constraints->>'max' AS max_value,
              value.constraints->>'pattern' AS pattern,
              value.constraints->>'refObjectTypeCode' AS ref_type,
              value.constraints->>'multiline' AS multiline,
              ARRAY(SELECT jsonb_array_elements_text(
                COALESCE(value.constraints->'enumValues', '[]'::jsonb))) AS enum_values
            FROM value_type value
            LEFT JOIN value_type parent ON parent.id = value.parent_value_type_id
            WHERE value.template_version_id = ?
            ORDER BY value.code
            """,
            (result, ignored) ->
                new TemplateValueType(
                    result.getString("code"),
                    result.getString("name"),
                    DataType.fromCode(result.getString("base_primitive")),
                    result.getString("parent_code"),
                    constraints(result)),
            templateVersionId);
    for (var row : rows) values.put(row.code(), row);
    return values;
  }

  private Map<String, TemplateFieldDef> templateFieldDefs(UUID templateVersionId) {
    var values = new LinkedHashMap<String, TemplateFieldDef>();
    jdbc.query(
        """
        SELECT object_type.code AS object_type_code, field.code, field.name, field.required,
          field.data_type, value_type.code AS value_type_code,
          field.constraints->>'minLength' AS min_length,
          field.constraints->>'maxLength' AS max_length,
          field.constraints->>'min' AS min_value,
          field.constraints->>'max' AS max_value,
          field.constraints->>'pattern' AS pattern,
          field.constraints->>'refObjectTypeCode' AS ref_type,
          field.constraints->>'multiline' AS multiline,
          ARRAY(SELECT jsonb_array_elements_text(
            COALESCE(field.constraints->'enumValues', '[]'::jsonb))) AS enum_values,
          redefined.code AS redefines_field_code
        FROM field_def field
        JOIN object_type object_type ON object_type.id = field.object_type_id
        LEFT JOIN value_type value_type ON value_type.id = field.value_type_id
        LEFT JOIN field_def redefined ON redefined.id = field.redefines_field_def_id
        WHERE field.template_version_id = ?
        ORDER BY object_type.code, field.code
        """,
        result -> {
          var row =
              new TemplateFieldDef(
                  result.getString("object_type_code"),
                  result.getString("code"),
                  result.getString("name"),
                  result.getBoolean("required"),
                  DataType.fromCode(result.getString("data_type")),
                  result.getString("value_type_code"),
                  constraints(result),
                  result.getString("redefines_field_code"));
          values.put(fieldKey(row.objectTypeCode(), row.code()), row);
        },
        templateVersionId);
    return values;
  }

  private Map<String, TemplateRelationType> templateRelationTypes(UUID templateVersionId) {
    var values = new LinkedHashMap<String, TemplateRelationType>();
    var rows =
        jdbc.query(
            """
            SELECT relation.code, source_type.code AS source_type_code,
              target_type.code AS target_type_code, relation.direction, relation.cardinality,
              relation.semantics, relation.hierarchical
            FROM relation_type relation
            JOIN object_type source_type ON source_type.id = relation.source_type
            JOIN object_type target_type ON target_type.id = relation.target_type
            WHERE relation.template_version_id = ?
            ORDER BY relation.code
            """,
            (result, ignored) ->
                new TemplateRelationType(
                    result.getString("code"),
                    result.getString("source_type_code"),
                    result.getString("target_type_code"),
                    result.getString("direction"),
                    result.getString("cardinality"),
                    result.getString("semantics"),
                    result.getBoolean("hierarchical")),
            templateVersionId);
    for (var row : rows) values.put(row.code(), row);
    return values;
  }

  private UUID runtimeObjectTypeId(UUID workspaceId, String code) {
    return jdbc.query(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        result -> result.next() ? result.getObject("id", UUID.class) : null,
        workspaceId,
        code);
  }

  private UUID runtimeValueTypeId(UUID workspaceId, String code) {
    return jdbc.query(
        "SELECT id FROM value_type WHERE workspace_id = ? AND code = ?",
        result -> result.next() ? result.getObject("id", UUID.class) : null,
        workspaceId,
        code);
  }

  private UUID runtimeRedefinedFieldId(UUID objectTypeId, String redefinesFieldCode) {
    if (redefinesFieldCode == null) return null;
    return ancestorFieldByCode(objectTypeId, redefinesFieldCode)
        .map(FieldDefRow::id)
        .orElseThrow(() -> CommandErrors.schema("重定义字段不存在"));
  }

  private boolean constraintsRelaxed(
      UUID workspaceId, FieldConstraints current, FieldConstraints next) {
    return relaxedMinLength(current.minLength(), next.minLength())
        && relaxedMaxLength(current.maxLength(), next.maxLength())
        && relaxedMin(current.min(), next.min())
        && relaxedMax(current.max(), next.max())
        && relaxedEnum(current.enumValues(), next.enumValues())
        && relaxedPattern(current.pattern(), next.pattern())
        && relaxedRef(workspaceId, current.refObjectTypeCode(), next.refObjectTypeCode())
        && relaxedMultiline(current.multiline(), next.multiline());
  }

  private boolean validRedefinitionConstraints(
      TemplateFieldDef field,
      Map<String, TemplateObjectType> objectTypes,
      Map<String, TemplateFieldDef> fields) {
    var parent = objectTypes.get(field.objectTypeCode());
    while (parent != null && parent.parentCode() != null) {
      var redefined = fields.get(fieldKey(parent.parentCode(), field.redefinesFieldCode()));
      if (redefined != null) {
        return narrowerOrEqual(redefined.constraints(), field.constraints());
      }
      parent = objectTypes.get(parent.parentCode());
    }
    return false;
  }

  private boolean narrowerOrEqual(FieldConstraints parent, FieldConstraints child) {
    return narrowerMinLength(parent.minLength(), child.minLength())
        && narrowerMaxLength(parent.maxLength(), child.maxLength())
        && narrowerMin(parent.min(), child.min())
        && narrowerMax(parent.max(), child.max())
        && enumSubset(parent.enumValues(), child.enumValues())
        && (parent.pattern() == null || same(parent.pattern(), child.pattern()))
        && same(parent.refObjectTypeCode(), child.refObjectTypeCode())
        && same(parent.multiline(), child.multiline());
  }

  private boolean narrowerMinLength(Integer parent, Integer child) {
    return child == null ? parent == null : parent == null || child >= parent;
  }

  private boolean narrowerMaxLength(Integer parent, Integer child) {
    return child == null ? parent == null : parent == null || child <= parent;
  }

  private boolean narrowerMin(BigDecimal parent, BigDecimal child) {
    return child == null ? parent == null : parent == null || child.compareTo(parent) >= 0;
  }

  private boolean narrowerMax(BigDecimal parent, BigDecimal child) {
    return child == null ? parent == null : parent == null || child.compareTo(parent) <= 0;
  }

  private boolean relaxedMinLength(Integer current, Integer next) {
    return next == null || (current != null && next <= current);
  }

  private boolean relaxedMaxLength(Integer current, Integer next) {
    return next == null || (current != null && next >= current);
  }

  private boolean relaxedMin(BigDecimal current, BigDecimal next) {
    return next == null || (current != null && next.compareTo(current) <= 0);
  }

  private boolean relaxedMax(BigDecimal current, BigDecimal next) {
    return next == null || (current != null && next.compareTo(current) >= 0);
  }

  private boolean relaxedEnum(List<String> current, List<String> next) {
    if (next == null || next.isEmpty()) return true;
    return current != null && next.containsAll(current);
  }

  private boolean enumSubset(List<String> parent, List<String> child) {
    if (parent == null || parent.isEmpty()) return true;
    return child != null && parent.containsAll(child);
  }

  private boolean relaxedPattern(String current, String next) {
    return next == null || same(current, next);
  }

  private boolean relaxedRef(UUID workspaceId, String current, String next) {
    if (next == null || same(current, next)) return true;
    if (current == null) return false;
    return objectTypeCodeDescendsFrom(workspaceId, current, next);
  }

  private boolean relaxedMultiline(Boolean current, Boolean next) {
    return next == null || same(current, next);
  }

  private List<Map<String, Object>> affectedObjects(
      UUID workspaceId, String objectTypeCode, String fieldCode, String reason) {
    var affected = new ArrayList<Map<String, Object>>();
    jdbc.query(
        """
        WITH RECURSIVE descendants AS (
          SELECT id, code FROM object_type WHERE workspace_id = ? AND code = ?
          UNION ALL
          SELECT child.id, child.code
          FROM object_type child
          JOIN descendants parent ON child.parent_type_id = parent.id
          WHERE child.workspace_id = ?
        )
        SELECT object.id, type.code
        FROM data_object object
        JOIN descendants type ON type.id = object.object_type_id
        WHERE object.workspace_id = ? AND object.status NOT IN ('VOID', 'FILED', 'DELETED')
        ORDER BY object.created_at, object.id
        LIMIT 200
        """,
        result -> {
          var item = new LinkedHashMap<String, Object>();
          item.put("reason", reason);
          item.put("objectTypeCode", result.getString("code"));
          item.put("objectId", result.getObject("id", UUID.class).toString());
          if (fieldCode != null) item.put("fieldCode", fieldCode);
          affected.add(item);
        },
        workspaceId,
        objectTypeCode,
        workspaceId,
        workspaceId);
    if (affected.isEmpty()) {
      affected.add(blocking(reason, objectTypeCode, fieldCode));
    }
    return affected;
  }

  private Map<String, Object> blocking(String reason, String objectTypeCode, String targetCode) {
    var item = new LinkedHashMap<String, Object>();
    item.put("reason", reason);
    if (objectTypeCode != null) item.put("objectTypeCode", objectTypeCode);
    if (targetCode != null) item.put("targetCode", targetCode);
    return item;
  }

  private String fieldKey(String objectTypeCode, String fieldCode) {
    return objectTypeCode + "." + fieldCode;
  }

  private boolean same(Object left, Object right) {
    return left == null ? right == null : left.equals(right);
  }

  private boolean same(FieldConstraints left, FieldConstraints right) {
    return same(left.asMap(), right.asMap());
  }

  private boolean sameExceptEnumValues(FieldConstraints left, FieldConstraints right) {
    return same(left.minLength(), right.minLength())
        && same(left.maxLength(), right.maxLength())
        && same(left.min(), right.min())
        && same(left.max(), right.max())
        && same(left.pattern(), right.pattern())
        && same(left.refObjectTypeCode(), right.refObjectTypeCode())
        && same(left.multiline(), right.multiline());
  }

  private void seedRootValueTypes(
      UUID sourceWorkspaceId,
      UUID targetWorkspaceId,
      String actor,
      Instant now,
      Map<UUID, UUID> valueTypeIds) {
    var roots =
        jdbc.query(
            """
            SELECT id, code, name, base_primitive, parent_value_type_id,
              constraints::text AS constraints_json, version
            FROM value_type
            WHERE workspace_id = ? AND template_version_id IS NULL
              AND parent_value_type_id IS NULL
              AND code = base_primitive
              AND published = TRUE
            ORDER BY code
            """,
            (result, ignored) -> copyValueTypeRow(result),
            sourceWorkspaceId);
    for (var root : roots) {
      var newId = UUID.randomUUID();
      valueTypeIds.put(root.id(), newId);
      insertCopiedValueType(newId, targetWorkspaceId, root, null, actor, now);
    }
  }

  private void copyValueTypes(
      UUID templateVersionId,
      UUID targetWorkspaceId,
      String actor,
      Instant now,
      Map<UUID, UUID> valueTypeIds) {
    var rows =
        jdbc.query(
            """
            SELECT id, code, name, base_primitive, parent_value_type_id,
              constraints::text AS constraints_json, version
            FROM value_type
            WHERE template_version_id = ?
            ORDER BY code
            """,
            (result, ignored) -> copyValueTypeRow(result),
            templateVersionId);
    for (var row : rows) {
      var newId = UUID.randomUUID();
      valueTypeIds.put(row.id(), newId);
      insertCopiedValueType(newId, targetWorkspaceId, row, null, actor, now);
    }
    for (var row : rows) {
      if (row.parentValueTypeId() != null) {
        updateValueTypeParent(
            valueTypeIds.get(row.id()), mapped(valueTypeIds, row.parentValueTypeId()));
      }
    }
  }

  private void insertCopiedValueType(
      UUID id,
      UUID workspaceId,
      CopyValueTypeRow row,
      UUID parentValueTypeId,
      String actor,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO value_type
          (id, workspace_id, template_version_id, code, name, base_primitive,
           parent_value_type_id, constraints, published, version)
        VALUES (?, ?, NULL, ?, ?, ?, ?, CAST(? AS jsonb), TRUE, ?)
        """,
        id,
        workspaceId,
        row.code(),
        row.name(),
        row.basePrimitive(),
        parentValueTypeId,
        row.constraintsJson(),
        row.version());
  }

  private void updateValueTypeParent(UUID id, UUID parentValueTypeId) {
    jdbc.update(
        "UPDATE value_type SET parent_value_type_id = ? WHERE id = ?", parentValueTypeId, id);
  }

  private void copyObjectTypes(
      UUID templateVersionId,
      UUID targetWorkspaceId,
      String actor,
      Instant now,
      Map<UUID, UUID> objectTypeIds) {
    var rows =
        jdbc.query(
            """
            SELECT id, code, name, parent_type_id
            FROM object_type
            WHERE template_version_id = ?
            ORDER BY code
            """,
            (result, ignored) ->
                new CopyObjectTypeRow(
                    result.getObject("id", UUID.class),
                    result.getString("code"),
                    result.getString("name"),
                    result.getObject("parent_type_id", UUID.class)),
            templateVersionId);
    for (var row : rows) {
      var newId = UUID.randomUUID();
      objectTypeIds.put(row.id(), newId);
      jdbc.update(
          """
          INSERT INTO object_type
            (id, workspace_id, template_version_id, code, name, parent_type_id, published,
             created_by, updated_by, created_at, updated_at)
          VALUES (?, ?, NULL, ?, ?, NULL, TRUE, ?, ?, ?, ?)
          """,
          newId,
          targetWorkspaceId,
          row.code(),
          row.name(),
          actor,
          actor,
          Timestamp.from(now),
          Timestamp.from(now));
    }
    for (var row : rows) {
      if (row.parentTypeId() != null) {
        jdbc.update(
            "UPDATE object_type SET parent_type_id = ? WHERE id = ?",
            mapped(objectTypeIds, row.parentTypeId()),
            objectTypeIds.get(row.id()));
      }
    }
  }

  private void copyFieldDefs(
      UUID templateVersionId,
      String actor,
      Instant now,
      Map<UUID, UUID> valueTypeIds,
      Map<UUID, UUID> objectTypeIds,
      Map<UUID, UUID> fieldDefIds) {
    var rows =
        jdbc.query(
            """
            SELECT id, object_type_id, code, name, required, data_type, value_type_id,
              constraints::text AS constraints_json, redefines_field_def_id
            FROM field_def
            WHERE template_version_id = ?
            ORDER BY code
            """,
            (result, ignored) -> copyFieldDefRow(result),
            templateVersionId);
    for (var row : rows) {
      var newId = UUID.randomUUID();
      fieldDefIds.put(row.id(), newId);
      jdbc.update(
          """
          INSERT INTO field_def
            (id, object_type_id, template_version_id, code, name, required, data_type,
             value_type_id, constraints, redefines_field_def_id, created_by, updated_by,
             created_at, updated_at)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?, CAST(? AS jsonb), NULL, ?, ?, ?, ?)
          """,
          newId,
          mapped(objectTypeIds, row.objectTypeId()),
          row.code(),
          row.name(),
          row.required(),
          row.dataType(),
          nullableMapped(valueTypeIds, row.valueTypeId()),
          row.constraintsJson(),
          actor,
          actor,
          Timestamp.from(now),
          Timestamp.from(now));
    }
    for (var row : rows) {
      if (row.redefinesFieldDefId() != null) {
        jdbc.update(
            "UPDATE field_def SET redefines_field_def_id = ? WHERE id = ?",
            mapped(fieldDefIds, row.redefinesFieldDefId()),
            fieldDefIds.get(row.id()));
      }
    }
  }

  private void copyRelationTypes(
      UUID templateVersionId,
      UUID targetWorkspaceId,
      String actor,
      Instant now,
      Map<UUID, UUID> objectTypeIds) {
    var rows =
        jdbc.query(
            """
            SELECT id, code, source_type, target_type, direction, cardinality, semantics,
              hierarchical
            FROM relation_type
            WHERE template_version_id = ?
            ORDER BY code
            """,
            (result, ignored) -> copyRelationTypeRow(result),
            templateVersionId);
    for (var row : rows) {
      jdbc.update(
          """
          INSERT INTO relation_type
            (id, workspace_id, template_version_id, code, source_type, target_type, direction,
             cardinality, semantics, hierarchical, created_by, updated_by, created_at, updated_at)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          UUID.randomUUID(),
          targetWorkspaceId,
          row.code(),
          mapped(objectTypeIds, row.sourceType()),
          mapped(objectTypeIds, row.targetType()),
          row.direction(),
          row.cardinality(),
          row.semantics(),
          row.hierarchical(),
          actor,
          actor,
          Timestamp.from(now),
          Timestamp.from(now));
    }
  }

  private CopyValueTypeRow copyValueTypeRow(ResultSet result) throws SQLException {
    return new CopyValueTypeRow(
        result.getObject("id", UUID.class),
        result.getString("code"),
        result.getString("name"),
        result.getString("base_primitive"),
        result.getObject("parent_value_type_id", UUID.class),
        result.getString("constraints_json"),
        result.getLong("version"));
  }

  private CopyFieldDefRow copyFieldDefRow(ResultSet result) throws SQLException {
    return new CopyFieldDefRow(
        result.getObject("id", UUID.class),
        result.getObject("object_type_id", UUID.class),
        result.getString("code"),
        result.getString("name"),
        result.getBoolean("required"),
        result.getString("data_type"),
        result.getObject("value_type_id", UUID.class),
        result.getString("constraints_json"),
        result.getObject("redefines_field_def_id", UUID.class));
  }

  private CopyRelationTypeRow copyRelationTypeRow(ResultSet result) throws SQLException {
    return new CopyRelationTypeRow(
        result.getObject("id", UUID.class),
        result.getString("code"),
        result.getObject("source_type", UUID.class),
        result.getObject("target_type", UUID.class),
        result.getString("direction"),
        result.getString("cardinality"),
        result.getString("semantics"),
        result.getBoolean("hierarchical"));
  }

  private UUID mapped(Map<UUID, UUID> ids, UUID oldId) {
    var newId = ids.get(oldId);
    if (newId == null) throw CommandErrors.schema("模板类型引用不完整");
    return newId;
  }

  private UUID nullableMapped(Map<UUID, UUID> ids, UUID oldId) {
    return oldId == null ? null : mapped(ids, oldId);
  }

  private List<ValueTypeRow> valueTypeChain(UUID valueTypeId) {
    return jdbc.query(
        """
        WITH RECURSIVE type_chain AS (
          SELECT id, template_version_id, code, base_primitive, parent_value_type_id,
            constraints, published, 0 AS depth
          FROM value_type WHERE id = ?
          UNION ALL
          SELECT parent.id, parent.template_version_id, parent.code, parent.base_primitive,
            parent.parent_value_type_id, parent.constraints, parent.published, child.depth + 1
          FROM value_type parent
          JOIN type_chain child ON parent.id = child.parent_value_type_id
          WHERE child.depth < 32
        )
        SELECT id, template_version_id, code, base_primitive, parent_value_type_id,
          constraints->>'minLength' AS min_length, constraints->>'maxLength' AS max_length,
          constraints->>'min' AS min_value, constraints->>'max' AS max_value,
          constraints->>'pattern' AS pattern, constraints->>'refObjectTypeCode' AS ref_type,
          constraints->>'multiline' AS multiline,
          ARRAY(SELECT jsonb_array_elements_text(
            COALESCE(constraints->'enumValues', '[]'::jsonb))) AS enum_values,
          published
        FROM type_chain ORDER BY depth DESC
        """,
        (result, ignored) -> valueTypeRow(result),
        valueTypeId);
  }

  private ObjectTypeRow objectTypeRow(ResultSet result) throws SQLException {
    return new ObjectTypeRow(
        result.getObject("id", UUID.class),
        result.getObject("template_version_id", UUID.class),
        result.getObject("parent_type_id", UUID.class),
        result.getBoolean("published"));
  }

  private ValueTypeRow valueTypeRow(ResultSet result) throws SQLException {
    return new ValueTypeRow(
        result.getObject("id", UUID.class),
        result.getObject("template_version_id", UUID.class),
        result.getString("code"),
        DataType.fromCode(result.getString("base_primitive")),
        result.getObject("parent_value_type_id", UUID.class),
        constraints(result),
        result.getBoolean("published"));
  }

  private FieldDefRow fieldDefRow(ResultSet result) throws SQLException {
    return new FieldDefRow(
        result.getObject("id", UUID.class),
        result.getString("code"),
        result.getBoolean("required"),
        DataType.fromCode(result.getString("data_type")),
        result.getObject("value_type_id", UUID.class),
        constraints(result));
  }

  private FieldConstraints constraints(ResultSet result) throws SQLException {
    return new FieldConstraints(
        integer(result.getString("min_length")),
        integer(result.getString("max_length")),
        decimal(result.getString("min_value")),
        decimal(result.getString("max_value")),
        result.getString("pattern"),
        stringsOrNull(result),
        result.getString("ref_type"),
        bool(result.getString("multiline")));
  }

  private static List<String> stringsOrNull(ResultSet result) throws SQLException {
    var values = List.of((String[]) result.getArray("enum_values").getArray());
    return values.isEmpty() ? null : values;
  }

  private static Integer integer(String value) {
    return value == null ? null : Integer.valueOf(value);
  }

  private static BigDecimal decimal(String value) {
    return value == null ? null : new BigDecimal(value);
  }

  private static Boolean bool(String value) {
    return value == null ? null : Boolean.valueOf(value);
  }
}
