package com.mnext.engines.exchange.sysml;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlAssociation;
import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlClass;
import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlProperty;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;

public final class SysmlXmiMapper {
  private SysmlXmiMapper() {}

  public static SysmlXmiModel toXmi(String objectType, DataSet dataSet) {
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
    return new SysmlXmiModel(classes(objects), associations(relations));
  }

  public static DataSet toDataSet(SysmlXmiModel model, DataSet current) {
    Objects.requireNonNull(model, "model");
    Objects.requireNonNull(current, "current");
    var currentObjects =
        current.objects().stream().collect(Collectors.toMap(DataObject::objectId, value -> value));
    var objects = new ArrayList<DataObject>();
    for (var value : model.classes()) {
      required(value.id(), "uml:Class xmi:id");
      var existing = currentObjects.get(value.id());
      objects.add(
          new DataObject(
              value.id(),
              objectType(value.stereotype()),
              fields(value),
              existing == null ? "DRAFT" : existing.status(),
              existing == null ? 1 : existing.version()));
    }
    return new DataSet(objects, relations(model, current, objects));
  }

  private static ArrayList<SysmlClass> classes(java.util.List<DataObject> objects) {
    var values = new ArrayList<SysmlClass>();
    for (var object : objects) {
      values.add(
          new SysmlClass(
              object.objectId(),
              name(object),
              stereotype(object.objectTypeCode()),
              properties(object)));
    }
    return values;
  }

  private static ArrayList<SysmlProperty> properties(DataObject object) {
    var values = new ArrayList<SysmlProperty>();
    new TreeMap<>(object.fields())
        .forEach(
            (code, value) ->
                values.add(
                    new SysmlProperty(
                        propertyId(object.objectId(), code),
                        code,
                        value == null ? "String" : value.getClass().getSimpleName(),
                        value == null ? null : String.valueOf(value))));
    return values;
  }

  private static ArrayList<SysmlAssociation> associations(java.util.List<DataRelation> relations) {
    return relations.stream()
        .map(
            value ->
                new SysmlAssociation(
                    value.relationId(),
                    "",
                    value.sourceId(),
                    value.targetId(),
                    stringFields(value.fields())))
        .collect(Collectors.toCollection(ArrayList::new));
  }

  private static Map<String, Object> fields(SysmlClass value) {
    var fields = new LinkedHashMap<String, Object>();
    if (value.name() != null && !value.name().isBlank()) fields.put("name", value.name());
    for (var property : value.properties()) {
      required(property.id(), "ownedAttribute xmi:id");
      required(property.name(), "ownedAttribute name");
      fields.put(property.name(), property.value() == null ? property.type() : property.value());
    }
    return fields;
  }

  private static java.util.List<DataRelation> relations(
      SysmlXmiModel model, DataSet current, java.util.List<DataObject> objects) {
    var objectIds = objects.stream().map(DataObject::objectId).collect(Collectors.toSet());
    var existing = new LinkedHashMap<String, String>();
    current.relations().forEach(value -> existing.put(relationKey(value), value.relationId()));
    var values = new ArrayList<DataRelation>();
    for (var value : model.associations()) {
      if (!objectIds.contains(value.sourceId()) || !objectIds.contains(value.targetId())) {
        throw new IllegalArgumentException("SysML Association 端点不存在");
      }
      var key = relationKey("uml_association", value.sourceId(), value.targetId());
      values.add(
          new DataRelation(
              existing.getOrDefault(key, value.id()),
              "uml_association",
              value.sourceId(),
              value.targetId(),
              new LinkedHashMap<>(value.fields())));
    }
    return values;
  }

  private static Map<String, String> stringFields(Map<String, Object> fields) {
    var values = new LinkedHashMap<String, String>();
    new TreeMap<>(fields)
        .forEach((code, value) -> values.put(code, value == null ? "" : String.valueOf(value)));
    return values;
  }

  private static String objectType(String stereotype) {
    if ("Block".equals(stereotype)) return "sysml_block";
    if ("requirement".equals(stereotype)) return "sysml_requirement";
    return "uml_class";
  }

  private static String stereotype(String objectTypeCode) {
    if ("sysml_block".equals(objectTypeCode)) return "Block";
    if ("sysml_requirement".equals(objectTypeCode)) return "requirement";
    return "";
  }

  private static String name(DataObject object) {
    var value = object.fields().get("name");
    return value == null ? object.objectId() : String.valueOf(value);
  }

  private static String propertyId(String objectId, String code) {
    return safe(objectId) + "-" + safe(code);
  }

  private static String relationKey(DataRelation value) {
    return relationKey(value.relationTypeCode(), value.sourceId(), value.targetId());
  }

  private static String relationKey(String type, String source, String target) {
    return type + "|" + source + "|" + target;
  }

  private static String safe(String value) {
    return required(value, "SysML identifier part").replaceAll("[^A-Za-z0-9_.-]", "_");
  }

  private static String required(String value, String name) {
    if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " 必填");
    return value;
  }
}
