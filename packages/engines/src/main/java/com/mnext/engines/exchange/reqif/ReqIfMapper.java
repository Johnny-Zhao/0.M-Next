package com.mnext.engines.exchange.reqif;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.reqif.ReqIfDocument.AttributeDef;
import com.mnext.engines.exchange.reqif.ReqIfDocument.DatatypeDef;
import com.mnext.engines.exchange.reqif.ReqIfDocument.SpecObject;
import com.mnext.engines.exchange.reqif.ReqIfDocument.SpecObjectType;
import com.mnext.engines.exchange.reqif.ReqIfDocument.SpecRelation;
import com.mnext.engines.exchange.reqif.ReqIfDocument.SpecRelationType;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;

public final class ReqIfMapper {
  private ReqIfMapper() {}

  public static ReqIfDocument toReqIf(String identifier, String objectType, DataSet dataSet) {
    Objects.requireNonNull(dataSet, "dataSet");
    var objects =
        dataSet.objects().stream()
            .filter(value -> objectType == null || objectType.equals(value.objectTypeCode()))
            .toList();
    var objectIds = objects.stream().map(DataObject::objectId).collect(Collectors.toSet());
    var relations =
        dataSet.relations().stream()
            .filter(
                value ->
                    objectIds.contains(value.sourceId()) && objectIds.contains(value.targetId()))
            .toList();
    var datatypeByKey = new LinkedHashMap<String, DatatypeDef>();
    var objectTypes = objectTypes(objects, datatypeByKey);
    var relationTypes = relationTypes(relations);
    return new ReqIfDocument(
        identifier,
        new ArrayList<>(datatypeByKey.values()),
        objectTypes,
        specObjects(objects),
        relationTypes,
        specRelations(relations));
  }

  public static DataSet toDataSet(ReqIfDocument document, DataSet current) {
    Objects.requireNonNull(document, "document");
    Objects.requireNonNull(current, "current");
    var typeById =
        document.objectTypes().stream()
            .collect(Collectors.toMap(SpecObjectType::identifier, SpecObjectType::longName));
    var currentObjects =
        current.objects().stream().collect(Collectors.toMap(DataObject::objectId, value -> value));
    var objects = new ArrayList<DataObject>();
    for (var value : document.objects()) {
      required(value.identifier(), "SPEC-OBJECT IDENTIFIER");
      var existing = currentObjects.get(value.identifier());
      objects.add(
          new DataObject(
              value.identifier(),
              required(typeById.get(value.typeRef()), "SPEC-OBJECT TYPE"),
              value.values(),
              existing == null ? "DRAFT" : existing.status(),
              existing == null ? 1 : existing.version()));
    }
    return new DataSet(objects, mapRelations(document, current, objects));
  }

  private static ArrayList<SpecObjectType> objectTypes(
      java.util.List<DataObject> objects, Map<String, DatatypeDef> datatypeByKey) {
    var fieldsByType = new TreeMap<String, Map<String, ReqIfDataType>>();
    for (var object : objects) {
      var fields =
          fieldsByType.computeIfAbsent(object.objectTypeCode(), ignored -> new TreeMap<>());
      object.fields().forEach((code, value) -> fields.putIfAbsent(code, dataType(value)));
    }
    var result = new ArrayList<SpecObjectType>();
    fieldsByType.forEach(
        (type, fields) -> {
          var attributes = new ArrayList<AttributeDef>();
          fields.forEach(
              (code, dataType) -> {
                var datatype = datatype(type, code, dataType);
                datatypeByKey.putIfAbsent(datatype.identifier(), datatype);
                attributes.add(
                    new AttributeDef(
                        attributeId(type, code), code, datatype.identifier(), dataType));
              });
          result.add(new SpecObjectType(typeId(type), type, attributes));
        });
    return result;
  }

  private static ArrayList<SpecObject> specObjects(java.util.List<DataObject> objects) {
    return objects.stream()
        .map(
            value ->
                new SpecObject(
                    value.objectId(),
                    value.objectId(),
                    typeId(value.objectTypeCode()),
                    new TreeMap<>(value.fields())))
        .collect(Collectors.toCollection(ArrayList::new));
  }

  private static ArrayList<SpecRelationType> relationTypes(java.util.List<DataRelation> relations) {
    return relations.stream()
        .map(DataRelation::relationTypeCode)
        .distinct()
        .sorted()
        .map(value -> new SpecRelationType(relationTypeId(value), value))
        .collect(Collectors.toCollection(ArrayList::new));
  }

  private static ArrayList<SpecRelation> specRelations(java.util.List<DataRelation> relations) {
    return relations.stream()
        .map(
            value ->
                new SpecRelation(
                    relationKey(value),
                    relationTypeId(value.relationTypeCode()),
                    value.sourceId(),
                    value.targetId(),
                    value.fields()))
        .collect(Collectors.toCollection(ArrayList::new));
  }

  private static java.util.List<DataRelation> mapRelations(
      ReqIfDocument document, DataSet current, java.util.List<DataObject> objects) {
    var objectIds = objects.stream().map(DataObject::objectId).collect(Collectors.toSet());
    var typeById =
        document.relationTypes().stream()
            .collect(Collectors.toMap(SpecRelationType::identifier, SpecRelationType::longName));
    var existing = new LinkedHashMap<String, String>();
    current.relations().forEach(value -> existing.put(relationKey(value), value.relationId()));
    var relations = new ArrayList<DataRelation>();
    for (var value : document.relations()) {
      if (!objectIds.contains(value.sourceRef()) || !objectIds.contains(value.targetRef())) {
        throw new IllegalArgumentException("ReqIF relation endpoint 不存在");
      }
      var type = required(typeById.get(value.typeRef()), "SPEC-RELATION TYPE");
      var key = relationKey(type, value.sourceRef(), value.targetRef());
      relations.add(
          new DataRelation(
              existing.getOrDefault(key, key),
              type,
              value.sourceRef(),
              value.targetRef(),
              value.values()));
    }
    return relations;
  }

  private static ReqIfDataType dataType(Object value) {
    if (value instanceof Integer || value instanceof Long) return ReqIfDataType.INTEGER;
    if (value instanceof Boolean) return ReqIfDataType.BOOLEAN;
    if (value instanceof Float
        || value instanceof Double
        || value instanceof java.math.BigDecimal) {
      return ReqIfDataType.REAL;
    }
    return ReqIfDataType.STRING;
  }

  private static DatatypeDef datatype(String type, String field, ReqIfDataType dataType) {
    return new DatatypeDef("dt-" + safe(type) + "-" + safe(field), field, dataType);
  }

  private static String typeId(String code) {
    return "ot-" + safe(code);
  }

  private static String attributeId(String type, String field) {
    return "ad-" + safe(type) + "-" + safe(field);
  }

  private static String relationTypeId(String code) {
    return "rt-" + safe(code);
  }

  private static String relationKey(DataRelation value) {
    return relationKey(value.relationTypeCode(), value.sourceId(), value.targetId());
  }

  private static String relationKey(String type, String source, String target) {
    return type + "|" + source + "|" + target;
  }

  private static String safe(String value) {
    required(value, "ReqIF identifier part");
    return value.replaceAll("[^A-Za-z0-9_.-]", "_");
  }

  private static String required(String value, String name) {
    if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " 必填");
    return value;
  }
}
