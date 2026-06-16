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
