package com.mnext.engines.exchange;

import java.util.List;
import java.util.Map;

public record DiffResult(ObjectDiff objects, RelationDiff relations, Summary summary) {
  public record ObjectDiff(List<String> added, List<String> removed, List<ChangedObject> changed) {}

  public record ChangedObject(String objectId, FieldDiff fields, ValueChange statusChanged) {}

  public record FieldDiff(
      Map<String, Object> added, Map<String, Object> removed, Map<String, ValueChange> changed) {}

  public record ValueChange(Object from, Object to) {}

  public record RelationDiff(
      List<String> added, List<String> removed, List<ChangedRelation> changed) {}

  public record ChangedRelation(
      String relationId, FieldDiff fields, EndpointChange endpointChanged) {}

  public record EndpointChange(
      String fromSource, String fromTarget, String toSource, String toTarget) {}

  public record Summary(
      int objectsAdded,
      int objectsRemoved,
      int objectsChanged,
      int relationsAdded,
      int relationsRemoved,
      int relationsChanged) {}
}
