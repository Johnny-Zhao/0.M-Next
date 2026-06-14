package com.mnext.engines.exchange;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class StructuredDiffTest {
  @Test
  void reportsObjectAndFieldChanges() {
    var before =
        data(
            List.of(
                object("removed", Map.of(), "DRAFT", 1),
                object("changed", Map.of("old", 1, "same", 2, "gone", 3), "DRAFT", 1)),
            List.of());
    var after =
        data(
            List.of(
                object("added", Map.of(), "DRAFT", 1),
                object("changed", Map.of("new", 4, "same", 5), "CONFIRMED", 2)),
            List.of());

    var result = StructuredDiff.diff(before, after);
    var changed = result.objects().changed().getFirst();

    assertEquals(List.of("added"), result.objects().added());
    assertEquals(List.of("removed"), result.objects().removed());
    assertEquals(Map.of("new", 4), changed.fields().added());
    assertEquals(Map.of("gone", 3, "old", 1), changed.fields().removed());
    assertEquals(new DiffResult.ValueChange(2, 5), changed.fields().changed().get("same"));
    assertEquals(new DiffResult.ValueChange("DRAFT", "CONFIRMED"), changed.statusChanged());
  }

  @Test
  void reportsRelationAddedRemovedFieldsAndEndpoints() {
    var before =
        data(
            List.of(),
            List.of(
                relation("removed", "a", "b", Map.of()),
                relation("changed", "a", "b", Map.of("weight", 1))));
    var after =
        data(
            List.of(),
            List.of(
                relation("added", "a", "b", Map.of()),
                relation("changed", "a", "c", Map.of("weight", 2))));

    var result = StructuredDiff.diff(before, after);
    var changed = result.relations().changed().getFirst();

    assertEquals(List.of("added"), result.relations().added());
    assertEquals(List.of("removed"), result.relations().removed());
    assertEquals(new DiffResult.ValueChange(1, 2), changed.fields().changed().get("weight"));
    assertEquals(new DiffResult.EndpointChange("a", "b", "a", "c"), changed.endpointChanged());
  }

  @Test
  void identicalInputProducesEmptyDiff() {
    var input =
        data(
            List.of(object("one", Map.of("value", 1), "DRAFT", 1)),
            List.of(relation("relation", "one", "two", Map.of())));

    var result = StructuredDiff.diff(input, input);

    assertTrue(result.objects().added().isEmpty());
    assertTrue(result.objects().removed().isEmpty());
    assertTrue(result.objects().changed().isEmpty());
    assertEquals(new DiffResult.Summary(0, 0, 0, 0, 0, 0), result.summary());
  }

  @Test
  void fieldOrderDoesNotChangeResult() {
    var ordered = new LinkedHashMap<String, Object>();
    ordered.put("a", 1);
    ordered.put("b", 2);
    var reversed = new LinkedHashMap<String, Object>();
    reversed.put("b", 2);
    reversed.put("a", 1);

    var first =
        StructuredDiff.diff(
            data(List.of(object("one", ordered, "DRAFT", 1)), List.of()),
            data(List.of(object("one", Map.of("a", 3, "c", 4), "DRAFT", 2)), List.of()));
    var second =
        StructuredDiff.diff(
            data(List.of(object("one", reversed, "DRAFT", 1)), List.of()),
            data(List.of(object("one", Map.of("c", 4, "a", 3), "DRAFT", 2)), List.of()));

    assertEquals(first, second);
  }

  @Test
  void versionDiffUsesTheSameObjectDiff() {
    var result =
        StructuredDiff.diff(
            data(List.of(object("one", Map.of("value", 1), "DRAFT", 1)), List.of()),
            data(List.of(object("one", Map.of("value", 2), "DRAFT", 2)), List.of()));

    var changed = result.objects().changed().getFirst();
    assertEquals("one", changed.objectId());
    assertEquals(new DiffResult.ValueChange(1, 2), changed.fields().changed().get("value"));
    assertNull(changed.statusChanged());
  }

  private static DataSet data(List<DataObject> objects, List<DataRelation> relations) {
    return new DataSet(objects, relations);
  }

  private static DataObject object(
      String id, Map<String, Object> fields, String status, long version) {
    return new DataObject(id, "demo", fields, status, version);
  }

  private static DataRelation relation(
      String id, String source, String target, Map<String, Object> fields) {
    return new DataRelation(id, "depends_on", source, target, fields);
  }
}
