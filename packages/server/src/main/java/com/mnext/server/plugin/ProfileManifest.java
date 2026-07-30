package com.mnext.server.plugin;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record ProfileManifest(
    String id,
    String name,
    String version,
    String templateCode,
    String kind,
    String sourceProfile,
    String targetProfile,
    Tags tags,
    List<ValueType> valueTypes,
    List<ObjectType> objectTypes,
    List<Field> fields,
    List<Relation> relations,
    List<DerivedField> derived,
    List<Rule> rules,
    CatalogLayout catalog) {
  public ProfileManifest(
      String id,
      String name,
      String version,
      String templateCode,
      String kind,
      String sourceProfile,
      String targetProfile,
      Tags tags,
      List<ValueType> valueTypes,
      List<ObjectType> objectTypes,
      List<Field> fields,
      List<Relation> relations,
      List<DerivedField> derived,
      List<Rule> rules) {
    this(
        id,
        name,
        version,
        templateCode,
        kind,
        sourceProfile,
        targetProfile,
        tags,
        valueTypes,
        objectTypes,
        fields,
        relations,
        derived,
        rules,
        null);
  }

  public CatalogLayout catalogOrEmpty() {
    return catalog == null ? new CatalogLayout(List.of(), List.of()) : catalog;
  }

  public List<ValueType> valueTypesOrEmpty() {
    return valueTypes == null ? List.of() : valueTypes;
  }

  public List<ObjectType> objectTypesOrEmpty() {
    return objectTypes == null ? List.of() : objectTypes;
  }

  public List<Field> fieldsOrEmpty() {
    return fields == null ? List.of() : fields;
  }

  public List<Relation> relationsOrEmpty() {
    return relations == null ? List.of() : relations;
  }

  public List<DerivedField> derivedOrEmpty() {
    return derived == null ? List.of() : derived;
  }

  public List<Rule> rulesOrEmpty() {
    return rules == null ? List.of() : rules;
  }

  public Tags tagsOrEmpty() {
    return tags == null ? new Tags(List.of(), List.of(), List.of()) : tags;
  }

  public record Tags(List<String> industry, List<String> profession, List<String> scenario) {
    public List<String> industryOrEmpty() {
      return industry == null ? List.of() : industry;
    }

    public List<String> professionOrEmpty() {
      return profession == null ? List.of() : profession;
    }

    public List<String> scenarioOrEmpty() {
      return scenario == null ? List.of() : scenario;
    }
  }

  public record ValueType(
      String code,
      String name,
      String basePrimitive,
      @JsonAlias("parent") String parentValueTypeCode,
      JsonNode constraints) {}

  public record ObjectType(String code, String name, @JsonAlias("parent") String parentTypeCode) {}

  public record Field(
      String objectType,
      String code,
      String name,
      String dataType,
      @JsonAlias("valueType") String valueTypeCode,
      Boolean required,
      Boolean unique,
      JsonNode constraints) {
    public Field(
        String objectType,
        String code,
        String name,
        String dataType,
        String valueTypeCode,
        Boolean required,
        JsonNode constraints) {
      this(objectType, code, name, dataType, valueTypeCode, required, null, constraints);
    }
  }

  public record Relation(
      String code,
      String name,
      String source,
      String target,
      String direction,
      String cardinality,
      String semantics,
      Boolean hierarchical,
      String kind) {}

  public record DerivedField(
      String objectType,
      String code,
      String name,
      String resultType,
      String derivation,
      String lang) {}

  public record Rule(
      String code,
      String objectType,
      String field,
      String severity,
      String when,
      String lang,
      String message,
      JsonNode impact,
      String suggest,
      JsonNode fix,
      Boolean lightweight) {}

  public record CatalogLayout(List<Directory> directories, List<Placement> placements) {
    public List<Directory> directoriesOrEmpty() {
      return directories == null ? List.of() : directories;
    }

    public List<Placement> placementsOrEmpty() {
      return placements == null ? List.of() : placements;
    }
  }

  public record Directory(
      String code, String name, @JsonAlias("parent") String parentCode, Integer sortOrder) {}

  public record Placement(String objectTypeCode, String directoryCode, Integer sortOrder) {}
}
