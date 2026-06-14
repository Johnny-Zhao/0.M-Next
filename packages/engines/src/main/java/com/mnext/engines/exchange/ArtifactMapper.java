package com.mnext.engines.exchange;

import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.JsonArtifact.ArtifactObject;
import com.mnext.engines.exchange.JsonArtifact.ArtifactRelation;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

public final class ArtifactMapper {
  private ArtifactMapper() {}

  public static JsonArtifact toArtifact(String workspace, String objectType, DataSet dataSet) {
    Objects.requireNonNull(dataSet, "dataSet");
    var objects =
        dataSet.objects().stream()
            .filter(value -> objectType == null || objectType.equals(value.objectTypeCode()))
            .map(
                value ->
                    new ArtifactObject(value.objectTypeCode(), value.fields(), value.objectId()))
            .toList();
    var keys = objects.stream().map(ArtifactObject::key).collect(Collectors.toSet());
    var relations =
        dataSet.relations().stream()
            .filter(value -> containsEndpoints(keys, value))
            .map(ArtifactMapper::artifactRelation)
            .toList();
    return new JsonArtifact(1, workspace, objectType, objects, relations);
  }

  private static boolean containsEndpoints(Set<String> keys, DataRelation relation) {
    return keys.contains(relation.sourceId()) && keys.contains(relation.targetId());
  }

  private static ArtifactRelation artifactRelation(DataRelation relation) {
    return new ArtifactRelation(
        relation.relationTypeCode(), relation.sourceId(), relation.targetId(), relation.fields());
  }

  public static DataSet toDataSet(JsonArtifact artifact, DataSet current) {
    Objects.requireNonNull(artifact, "artifact");
    Objects.requireNonNull(current, "current");
    var currentObjects = byObjectId(current);
    var objects = new ArrayList<DataObject>();
    for (var value : artifact.objects()) {
      requireKey(value.key(), "object key");
      var existing = currentObjects.get(value.key());
      objects.add(
          new DataObject(
              value.key(),
              value.objectTypeCode(),
              value.fields(),
              existing == null ? "DRAFT" : existing.status(),
              existing == null ? 1 : existing.version()));
    }
    return new DataSet(objects, mapRelations(artifact, current, objects));
  }

  private static Map<String, DataObject> byObjectId(DataSet current) {
    return current.objects().stream()
        .collect(Collectors.toMap(DataObject::objectId, value -> value));
  }

  private static java.util.List<DataRelation> mapRelations(
      JsonArtifact artifact, DataSet current, java.util.List<DataObject> objects) {
    var objectIds = objects.stream().map(DataObject::objectId).collect(Collectors.toSet());
    var existing = new HashMap<String, String>();
    for (var relation : current.relations()) {
      existing.put(relationKey(relation), relation.relationId());
    }
    var relations = new ArrayList<DataRelation>();
    for (var value : artifact.relations()) {
      requireKey(value.sourceKey(), "sourceKey");
      requireKey(value.targetKey(), "targetKey");
      if (!objectIds.contains(value.sourceKey()) || !objectIds.contains(value.targetKey())) {
        throw new IllegalArgumentException("relation endpoint key 必须存在于 objects");
      }
      var key = relationKey(value);
      relations.add(
          new DataRelation(
              existing.getOrDefault(key, key),
              value.relationTypeCode(),
              value.sourceKey(),
              value.targetKey(),
              value.fields()));
    }
    return relations;
  }

  private static String relationKey(DataRelation value) {
    return value.relationTypeCode() + "|" + value.sourceId() + "|" + value.targetId();
  }

  private static String relationKey(ArtifactRelation value) {
    return value.relationTypeCode() + "|" + value.sourceKey() + "|" + value.targetKey();
  }

  private static void requireKey(String value, String name) {
    if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " 必填");
  }
}
