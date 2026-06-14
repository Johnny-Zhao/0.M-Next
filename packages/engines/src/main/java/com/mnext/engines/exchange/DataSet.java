package com.mnext.engines.exchange;

import java.util.List;
import java.util.Map;

public record DataSet(List<DataObject> objects, List<DataRelation> relations) {
  public DataSet {
    objects = objects == null ? List.of() : List.copyOf(objects);
    relations = relations == null ? List.of() : List.copyOf(relations);
  }

  public record DataObject(
      String objectId,
      String objectTypeCode,
      Map<String, Object> fields,
      String status,
      long version) {
    public DataObject {
      fields = fields == null ? Map.of() : Map.copyOf(fields);
    }
  }

  public record DataRelation(
      String relationId,
      String relationTypeCode,
      String sourceId,
      String targetId,
      Map<String, Object> fields) {
    public DataRelation {
      fields = fields == null ? Map.of() : Map.copyOf(fields);
    }
  }
}
