package com.mnext.engines.exchange.sysml;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlAssociation;
import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlClass;
import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlDependency;
import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlProperty;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;

public final class SysmlXmiMapper {
  private static final SysmlManifestMapping MAPPING = SysmlManifestMapping.get();

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
    return new SysmlXmiModel(
        List.of(),
        List.of(),
        classes(objects),
        associations(relations),
        dependencies(relations),
        List.of());
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
              MAPPING.objectType(value.stereotype()),
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
              MAPPING.stereotype(object.objectTypeCode(), object.fields()),
              properties(object)));
    }
    return values;
  }

  private static ArrayList<SysmlProperty> properties(DataObject object) {
    var values = new ArrayList<SysmlProperty>();
    new TreeMap<>(object.fields())
        .forEach(
            (code, value) -> {
              if (code.startsWith("uml_")
                  || code.endsWith("_kind")
                  || code.endsWith("_aggregation")) {
                return;
              }
              values.add(
                  new SysmlProperty(
                      propertyId(object.objectId(), code),
                      code,
                      value == null ? "String" : value.getClass().getSimpleName(),
                      value == null ? null : String.valueOf(value)));
            });
    return values;
  }

  private static ArrayList<SysmlAssociation> associations(java.util.List<DataRelation> relations) {
    return relations.stream()
        .filter(value -> !isDependency(value))
        .map(
            value ->
                new SysmlAssociation(
                    value.relationId(),
                    stringField(value.fields(), "uml_stereotype"),
                    value.sourceId(),
                    value.targetId(),
                    stringField(value.fields(), "uml_kind", "association"),
                    stringFields(value.fields())))
        .collect(Collectors.toCollection(ArrayList::new));
  }

  private static ArrayList<SysmlDependency> dependencies(java.util.List<DataRelation> relations) {
    return relations.stream()
        .filter(SysmlXmiMapper::isDependency)
        .map(
            value ->
                new SysmlDependency(
                    value.relationId(),
                    stringField(value.fields(), "uml_stereotype"),
                    value.sourceId(),
                    value.targetId(),
                    stringField(value.fields(), "uml_kind", "dependency")))
        .collect(Collectors.toCollection(ArrayList::new));
  }

  private static Map<String, Object> fields(SysmlClass value) {
    var fields = new LinkedHashMap<String, Object>();
    if (value.name() != null && !value.name().isBlank()) fields.put("name", value.name());
    if (!MAPPING.knownStereotype(value.stereotype()) && !blank(value.stereotype())) {
      fields.put("uml_stereotype", value.stereotype());
    }
    if (!blank(value.umlType()) && !"uml:Class".equals(value.umlType())) {
      fields.put("uml_type", value.umlType());
    }
    for (var property : value.properties()) {
      required(property.id(), "ownedAttribute xmi:id");
      required(property.name(), "ownedAttribute name");
      fields.put(property.name(), property.value() == null ? property.type() : property.value());
      if (!blank(property.kind()) && !"property".equals(property.kind())) {
        fields.put(property.name() + "_kind", property.kind());
      }
      if (!blank(property.aggregation())) {
        fields.put(property.name() + "_aggregation", property.aggregation());
      }
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
      var relationType = MAPPING.relationType(value.kind(), value.stereotype());
      var key = relationKey(relationType, value.sourceId(), value.targetId());
      values.add(
          new DataRelation(
              existing.getOrDefault(key, value.id()),
              relationType,
              value.sourceId(),
              value.targetId(),
              relationFields(value.kind(), value.stereotype(), value.fields())));
    }
    for (var value : model.dependencies()) {
      values.add(dependencyRelation(value, objectIds, existing));
    }
    return values;
  }

  private static DataRelation dependencyRelation(
      SysmlDependency value, java.util.Set<String> objectIds, Map<String, String> existing) {
    if (!objectIds.contains(value.sourceId()) || !objectIds.contains(value.targetId())) {
      throw new IllegalArgumentException("SysML Dependency 端点不存在");
    }
    var relationType = MAPPING.relationType(value.kind(), value.stereotype());
    var key = relationKey(relationType, value.sourceId(), value.targetId());
    return new DataRelation(
        existing.getOrDefault(key, value.id()),
        relationType,
        value.sourceId(),
        value.targetId(),
        relationFields(value.kind(), value.stereotype(), Map.of()));
  }

  private static Map<String, Object> relationFields(
      String kind, String stereotype, Map<String, String> fields) {
    var values = new LinkedHashMap<String, Object>(fields);
    if (!blank(kind) && !"association".equals(kind)) values.put("uml_kind", kind);
    if (!blank(stereotype)) values.put("uml_stereotype", stereotype);
    return values;
  }

  private static Map<String, String> stringFields(Map<String, Object> fields) {
    var values = new LinkedHashMap<String, String>();
    new TreeMap<>(fields)
        .forEach((code, value) -> values.put(code, value == null ? "" : String.valueOf(value)));
    return values;
  }

  private static boolean isDependency(DataRelation value) {
    var kind = stringField(value.fields(), "uml_kind");
    var stereotype = stringField(value.fields(), "uml_stereotype");
    return switch (SysmlManifestMapping.normalize(kind).isBlank()
        ? SysmlManifestMapping.normalize(stereotype)
        : SysmlManifestMapping.normalize(kind)) {
      case "dependency",
          "abstraction",
          "realization",
          "usage",
          "satisfy",
          "derive",
          "verify",
          "refine",
          "allocate",
          "trace" ->
          true;
      default -> false;
    };
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

  private static String stringField(Map<String, Object> fields, String code) {
    return stringField(fields, code, "");
  }

  private static String stringField(Map<String, Object> fields, String code, String fallback) {
    var value = fields.get(code);
    return value == null ? fallback : String.valueOf(value);
  }

  private static String required(String value, String name) {
    if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " 必填");
    return value;
  }

  private static boolean blank(String value) {
    return value == null || value.isBlank();
  }
}
