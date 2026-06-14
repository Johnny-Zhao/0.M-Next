package com.mnext.engines.exchange;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.JsonArtifact.ArtifactObject;
import com.mnext.engines.exchange.JsonArtifact.ArtifactRelation;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JsonExchangeTest {
  private final JsonCodec codec = new JsonCodec(new ObjectMapper());

  @Test
  void artifactSerializationRoundTrips() {
    var artifact =
        new JsonArtifact(
            1,
            "workspace",
            "demo",
            List.of(new ArtifactObject("demo", Map.of("value", 1), "one")),
            List.of(new ArtifactRelation("depends", "one", "two", Map.of("weight", 2))));

    assertEquals(artifact, codec.parse(codec.serialize(artifact)));
  }

  @Test
  void artifactAndDataSetRoundTripKeepsSemanticIdentity() {
    var current =
        data(
            List.of(object("one", 1), object("two", 2)),
            List.of(new DataRelation("relation-id", "depends", "one", "two", Map.of())));

    var artifact = ArtifactMapper.toArtifact("workspace", null, current);
    var mapped = ArtifactMapper.toDataSet(artifact, current);

    assertEquals(current, mapped);
  }

  @Test
  void mapsAddedObjectsAndRelationsByExternalKeys() {
    var current = data(List.of(object("one", 1)), List.of());
    var artifact =
        new JsonArtifact(
            1,
            "workspace",
            "demo",
            List.of(
                new ArtifactObject("demo", Map.of("value", 3), "one"),
                new ArtifactObject("demo", Map.of("value", 2), "external-two")),
            List.of(new ArtifactRelation("depends", "one", "external-two", Map.of("weight", 1))));

    var mapped = ArtifactMapper.toDataSet(artifact, current);
    var diff = StructuredDiff.diff(current, mapped);

    assertEquals(List.of("external-two"), diff.objects().added());
    assertEquals(1, diff.objects().changed().size());
    assertEquals(List.of("depends|one|external-two"), diff.relations().added());
  }

  @Test
  void rejectsUnsupportedVersionAndMissingRelationEndpoint() {
    assertThrows(
        IllegalArgumentException.class,
        () -> codec.parse("{\"version\":2,\"objects\":[],\"relations\":[]}"));
    var invalid =
        new JsonArtifact(
            1,
            "workspace",
            null,
            List.of(new ArtifactObject("demo", Map.of(), "one")),
            List.of(new ArtifactRelation("depends", "one", "missing", Map.of())));
    assertThrows(
        IllegalArgumentException.class,
        () -> ArtifactMapper.toDataSet(invalid, new DataSet(null, null)));
  }

  private static DataSet data(List<DataObject> objects, List<DataRelation> relations) {
    return new DataSet(objects, relations);
  }

  private static DataObject object(String id, Object value) {
    return new DataObject(id, "demo", Map.of("value", value), "DRAFT", 1);
  }
}
