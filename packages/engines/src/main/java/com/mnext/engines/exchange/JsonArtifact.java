package com.mnext.engines.exchange;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record JsonArtifact(
    int version,
    String workspace,
    String objectType,
    List<ArtifactObject> objects,
    List<ArtifactRelation> relations) {
  public JsonArtifact {
    objects = objects == null ? List.of() : List.copyOf(objects);
    relations = relations == null ? List.of() : List.copyOf(relations);
  }

  public record ArtifactObject(String objectTypeCode, Map<String, Object> fields, String key) {
    public ArtifactObject {
      fields = copy(fields);
    }
  }

  public record ArtifactRelation(
      String relationTypeCode, String sourceKey, String targetKey, Map<String, Object> fields) {
    public ArtifactRelation {
      fields = copy(fields);
    }
  }

  private static Map<String, Object> copy(Map<String, Object> values) {
    return values == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(values));
  }
}
