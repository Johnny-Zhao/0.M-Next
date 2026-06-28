package com.mnext.server.plugin;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record ProfileManifest(
    String id,
    String name,
    String version,
    String templateCode,
    List<ValueType> valueTypes,
    List<ObjectType> objectTypes,
    List<Field> fields,
    List<Relation> relations,
    List<DerivedField> derived,
    List<Rule> rules) {
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
      JsonNode constraints) {}

  public record Relation(
      String code,
      String name,
      String source,
      String target,
      String direction,
      String cardinality,
      String semantics,
      Boolean hierarchical) {}

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
}
