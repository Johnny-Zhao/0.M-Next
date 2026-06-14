package com.mnext.engines.exchange.reqif;

import java.util.List;
import java.util.Map;

public record ReqIfDocument(
    String identifier,
    List<DatatypeDef> datatypes,
    List<SpecObjectType> objectTypes,
    List<SpecObject> objects,
    List<SpecRelationType> relationTypes,
    List<SpecRelation> relations) {
  public ReqIfDocument {
    datatypes = datatypes == null ? List.of() : List.copyOf(datatypes);
    objectTypes = objectTypes == null ? List.of() : List.copyOf(objectTypes);
    objects = objects == null ? List.of() : List.copyOf(objects);
    relationTypes = relationTypes == null ? List.of() : List.copyOf(relationTypes);
    relations = relations == null ? List.of() : List.copyOf(relations);
  }

  public record DatatypeDef(String identifier, String longName, ReqIfDataType dataType) {}

  public record AttributeDef(
      String identifier, String longName, String datatypeRef, ReqIfDataType dataType) {}

  public record SpecObjectType(String identifier, String longName, List<AttributeDef> attributes) {
    public SpecObjectType {
      attributes = attributes == null ? List.of() : List.copyOf(attributes);
    }
  }

  public record SpecObject(
      String identifier, String longName, String typeRef, Map<String, Object> values) {
    public SpecObject {
      values = values == null ? Map.of() : Map.copyOf(values);
    }
  }

  public record SpecRelationType(String identifier, String longName) {}

  public record SpecRelation(
      String identifier, String typeRef, String sourceRef, String targetRef, Map<String, Object> values) {
    public SpecRelation {
      values = values == null ? Map.of() : Map.copyOf(values);
    }
  }
}
