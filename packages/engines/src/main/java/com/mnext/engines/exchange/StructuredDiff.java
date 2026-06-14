package com.mnext.engines.exchange;

import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.DiffResult.ChangedObject;
import com.mnext.engines.exchange.DiffResult.ChangedRelation;
import com.mnext.engines.exchange.DiffResult.EndpointChange;
import com.mnext.engines.exchange.DiffResult.FieldDiff;
import com.mnext.engines.exchange.DiffResult.ValueChange;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class StructuredDiff {
  private StructuredDiff() {}

  public static DiffResult diff(DataSet a, DataSet b) {
    Objects.requireNonNull(a, "a");
    Objects.requireNonNull(b, "b");
    var objects = objectDiff(a.objects(), b.objects());
    var relations = relationDiff(a.relations(), b.relations());
    return new DiffResult(
        objects,
        relations,
        new DiffResult.Summary(
            objects.added().size(),
            objects.removed().size(),
            objects.changed().size(),
            relations.added().size(),
            relations.removed().size(),
            relations.changed().size()));
  }

  private static DiffResult.ObjectDiff objectDiff(List<DataObject> a, List<DataObject> b) {
    var before = byId(a, DataObject::objectId);
    var after = byId(b, DataObject::objectId);
    var changed = new ArrayList<ChangedObject>();
    for (var id : intersection(before, after)) {
      var oldObject = before.get(id);
      var newObject = after.get(id);
      var fields = fieldDiff(oldObject.fields(), newObject.fields());
      var status =
          Objects.equals(oldObject.status(), newObject.status())
              ? null
              : new ValueChange(oldObject.status(), newObject.status());
      if (!empty(fields) || status != null) {
        changed.add(new ChangedObject(id, fields, status));
      }
    }
    return new DiffResult.ObjectDiff(added(before, after), removed(before, after), changed);
  }

  private static DiffResult.RelationDiff relationDiff(List<DataRelation> a, List<DataRelation> b) {
    var before = byId(a, DataRelation::relationId);
    var after = byId(b, DataRelation::relationId);
    var changed = new ArrayList<ChangedRelation>();
    for (var id : intersection(before, after)) {
      var oldRelation = before.get(id);
      var newRelation = after.get(id);
      var fields = fieldDiff(oldRelation.fields(), newRelation.fields());
      var endpoints = endpointDiff(oldRelation, newRelation);
      if (!empty(fields) || endpoints != null) {
        changed.add(new ChangedRelation(id, fields, endpoints));
      }
    }
    return new DiffResult.RelationDiff(added(before, after), removed(before, after), changed);
  }

  private static FieldDiff fieldDiff(Map<String, Object> a, Map<String, Object> b) {
    var added = new TreeMap<String, Object>();
    var removed = new TreeMap<String, Object>();
    var changed = new TreeMap<String, ValueChange>();
    for (var code : b.keySet()) {
      if (!a.containsKey(code)) added.put(code, b.get(code));
    }
    for (var code : a.keySet()) {
      if (!b.containsKey(code)) removed.put(code, a.get(code));
      else if (!Objects.equals(a.get(code), b.get(code))) {
        changed.put(code, new ValueChange(a.get(code), b.get(code)));
      }
    }
    return new FieldDiff(added, removed, changed);
  }

  private static EndpointChange endpointDiff(DataRelation a, DataRelation b) {
    if (Objects.equals(a.sourceId(), b.sourceId()) && Objects.equals(a.targetId(), b.targetId())) {
      return null;
    }
    return new EndpointChange(a.sourceId(), a.targetId(), b.sourceId(), b.targetId());
  }

  private static boolean empty(FieldDiff fields) {
    return fields.added().isEmpty() && fields.removed().isEmpty() && fields.changed().isEmpty();
  }

  private static <T> TreeMap<String, T> byId(List<T> values, Function<T, String> id) {
    return values.stream()
        .collect(
            Collectors.toMap(
                id, Function.identity(), (left, right) -> duplicate(id.apply(left)), TreeMap::new));
  }

  private static <T> T duplicate(String id) {
    throw new IllegalArgumentException("duplicate id: " + id);
  }

  private static <T> List<String> intersection(Map<String, T> a, Map<String, T> b) {
    return a.keySet().stream().filter(b::containsKey).toList();
  }

  private static <T> List<String> added(Map<String, T> a, Map<String, T> b) {
    return b.keySet().stream().filter(id -> !a.containsKey(id)).toList();
  }

  private static <T> List<String> removed(Map<String, T> a, Map<String, T> b) {
    return a.keySet().stream().filter(id -> !b.containsKey(id)).toList();
  }
}
