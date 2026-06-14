package com.mnext.engines.exchange;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.reqif.ReqIfCodec;
import com.mnext.engines.exchange.reqif.ReqIfMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ReqIfExchangeTest {
  private final ReqIfCodec codec = new ReqIfCodec();

  @Test
  void serializationRoundTripKeepsDataSetIdentity() {
    var dataSet =
        new DataSet(
            List.of(
                new DataObject("REQ-1", "Requirement", Map.of("title", "One", "priority", 1), "DRAFT", 3),
                new DataObject("REQ-2", "Requirement", Map.of("title", "Two"), "DRAFT", 1)),
            List.of(new DataRelation("rel-1", "satisfies", "REQ-1", "REQ-2", Map.of())));

    var reqif = ReqIfMapper.toReqIf("snapshot-1", null, dataSet);
    var mapped = ReqIfMapper.toDataSet(codec.parse(codec.serialize(reqif)), dataSet);

    assertEquals(dataSet, mapped);
  }

  @Test
  void parsesAndExportsDatatypeMatrix() {
    var document = codec.parse(datatypeMatrix());
    var xml = codec.serialize(document);

    assertEquals(6, document.datatypes().size());
    assertEquals("hello", document.objects().getFirst().values().get("text"));
    assertEquals(7, document.objects().getFirst().values().get("count"));
    assertEquals(true, document.objects().getFirst().values().get("enabled"));
    assertEquals("open", document.objects().getFirst().values().get("state"));
    assertEquals(1.5d, document.objects().getFirst().values().get("score"));
    assertEquals("2026-06-14T00:00:00Z", document.objects().getFirst().values().get("date"));
    assertEquals(6, codec.parse(xml).datatypes().size());
  }

  @Test
  void mapsAddedObjectsAndRelationsByIdentifier() {
    var current =
        new DataSet(List.of(new DataObject("REQ-1", "Requirement", Map.of("title", "One"), "DRAFT", 2)), List.of());

    var mapped = ReqIfMapper.toDataSet(codec.parse(twoObjectReqIf()), current);
    var diff = StructuredDiff.diff(current, mapped);

    assertEquals(List.of("REQ-2"), diff.objects().added());
    assertEquals(1, diff.objects().changed().size());
    assertEquals(List.of("relates|REQ-1|REQ-2"), diff.relations().added());
  }

  @Test
  void rejectsInvalidXmlUnknownDatatypeMissingIdentifierAndMissingEndpoint() {
    assertThrows(IllegalArgumentException.class, () -> codec.parse("<REQ-IF>"));
    assertThrows(
        IllegalArgumentException.class,
        () -> codec.parse(datatypeMatrix().replace("DATATYPE-DEFINITION-STRING", "DATATYPE-DEFINITION-UNKNOWN")));
    assertThrows(
        IllegalArgumentException.class,
        () -> codec.parse(twoObjectReqIf().replace("IDENTIFIER=\"REQ-2\"", "LONG-NAME=\"REQ-2\"")));
    assertThrows(
        IllegalArgumentException.class,
        () -> codec.parse(twoObjectReqIf().replace("REQ-2</SPEC-OBJECT-REF>", "MISSING</SPEC-OBJECT-REF>")));
  }

  private static String twoObjectReqIf() {
    return """
        <REQ-IF><THE-HEADER><REQ-IF-HEADER IDENTIFIER="h"/></THE-HEADER>
        <CORE-CONTENT><REQ-IF-CONTENT>
        <DATATYPES><DATATYPE-DEFINITION-STRING IDENTIFIER="dt-title" LONG-NAME="title"/></DATATYPES>
        <SPEC-TYPES>
          <SPEC-OBJECT-TYPE IDENTIFIER="ot-req" LONG-NAME="Requirement">
            <SPEC-ATTRIBUTES><ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-title" LONG-NAME="title">
              <TYPE><DATATYPE-DEFINITION-STRING-REF>dt-title</DATATYPE-DEFINITION-STRING-REF></TYPE>
            </ATTRIBUTE-DEFINITION-STRING></SPEC-ATTRIBUTES>
          </SPEC-OBJECT-TYPE>
          <SPEC-RELATION-TYPE IDENTIFIER="rt-relates" LONG-NAME="relates"/>
        </SPEC-TYPES>
        <SPEC-OBJECTS>
          <SPEC-OBJECT IDENTIFIER="REQ-1"><TYPE><SPEC-OBJECT-TYPE-REF>ot-req</SPEC-OBJECT-TYPE-REF></TYPE>
            <VALUES><ATTRIBUTE-VALUE-STRING THE-VALUE="Changed"><DEFINITION>
              <ATTRIBUTE-DEFINITION-STRING-REF>ad-title</ATTRIBUTE-DEFINITION-STRING-REF>
            </DEFINITION></ATTRIBUTE-VALUE-STRING></VALUES></SPEC-OBJECT>
          <SPEC-OBJECT IDENTIFIER="REQ-2"><TYPE><SPEC-OBJECT-TYPE-REF>ot-req</SPEC-OBJECT-TYPE-REF></TYPE>
            <VALUES><ATTRIBUTE-VALUE-STRING THE-VALUE="Two"><DEFINITION>
              <ATTRIBUTE-DEFINITION-STRING-REF>ad-title</ATTRIBUTE-DEFINITION-STRING-REF>
            </DEFINITION></ATTRIBUTE-VALUE-STRING></VALUES></SPEC-OBJECT>
        </SPEC-OBJECTS>
        <SPEC-RELATIONS><SPEC-RELATION IDENTIFIER="REL-1"><TYPE>
          <SPEC-RELATION-TYPE-REF>rt-relates</SPEC-RELATION-TYPE-REF></TYPE>
          <SOURCE><SPEC-OBJECT-REF>REQ-1</SPEC-OBJECT-REF></SOURCE>
          <TARGET><SPEC-OBJECT-REF>REQ-2</SPEC-OBJECT-REF></TARGET>
        </SPEC-RELATION></SPEC-RELATIONS>
        </REQ-IF-CONTENT></CORE-CONTENT></REQ-IF>
        """;
  }

  private static String datatypeMatrix() {
    return """
        <REQ-IF><THE-HEADER><REQ-IF-HEADER IDENTIFIER="h"/></THE-HEADER>
        <CORE-CONTENT><REQ-IF-CONTENT><DATATYPES>
          <DATATYPE-DEFINITION-STRING IDENTIFIER="dt-text" LONG-NAME="text"/>
          <DATATYPE-DEFINITION-INTEGER IDENTIFIER="dt-count" LONG-NAME="count"/>
          <DATATYPE-DEFINITION-BOOLEAN IDENTIFIER="dt-enabled" LONG-NAME="enabled"/>
          <DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="dt-state" LONG-NAME="state"/>
          <DATATYPE-DEFINITION-REAL IDENTIFIER="dt-score" LONG-NAME="score"/>
          <DATATYPE-DEFINITION-DATE IDENTIFIER="dt-date" LONG-NAME="date"/>
        </DATATYPES><SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="ot-req" LONG-NAME="Requirement">
          <SPEC-ATTRIBUTES>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-text" LONG-NAME="text"><TYPE><DATATYPE-DEFINITION-STRING-REF>dt-text</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-INTEGER IDENTIFIER="ad-count" LONG-NAME="count"><TYPE><DATATYPE-DEFINITION-INTEGER-REF>dt-count</DATATYPE-DEFINITION-INTEGER-REF></TYPE></ATTRIBUTE-DEFINITION-INTEGER>
            <ATTRIBUTE-DEFINITION-BOOLEAN IDENTIFIER="ad-enabled" LONG-NAME="enabled"><TYPE><DATATYPE-DEFINITION-BOOLEAN-REF>dt-enabled</DATATYPE-DEFINITION-BOOLEAN-REF></TYPE></ATTRIBUTE-DEFINITION-BOOLEAN>
            <ATTRIBUTE-DEFINITION-ENUMERATION IDENTIFIER="ad-state" LONG-NAME="state"><TYPE><DATATYPE-DEFINITION-ENUMERATION-REF>dt-state</DATATYPE-DEFINITION-ENUMERATION-REF></TYPE></ATTRIBUTE-DEFINITION-ENUMERATION>
            <ATTRIBUTE-DEFINITION-REAL IDENTIFIER="ad-score" LONG-NAME="score"><TYPE><DATATYPE-DEFINITION-REAL-REF>dt-score</DATATYPE-DEFINITION-REAL-REF></TYPE></ATTRIBUTE-DEFINITION-REAL>
            <ATTRIBUTE-DEFINITION-DATE IDENTIFIER="ad-date" LONG-NAME="date"><TYPE><DATATYPE-DEFINITION-DATE-REF>dt-date</DATATYPE-DEFINITION-DATE-REF></TYPE></ATTRIBUTE-DEFINITION-DATE>
          </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES><SPEC-OBJECTS>
          <SPEC-OBJECT IDENTIFIER="REQ-1"><TYPE><SPEC-OBJECT-TYPE-REF>ot-req</SPEC-OBJECT-TYPE-REF></TYPE><VALUES>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="hello"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>ad-text</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>
            <ATTRIBUTE-VALUE-INTEGER THE-VALUE="7"><DEFINITION><ATTRIBUTE-DEFINITION-INTEGER-REF>ad-count</ATTRIBUTE-DEFINITION-INTEGER-REF></DEFINITION></ATTRIBUTE-VALUE-INTEGER>
            <ATTRIBUTE-VALUE-BOOLEAN THE-VALUE="true"><DEFINITION><ATTRIBUTE-DEFINITION-BOOLEAN-REF>ad-enabled</ATTRIBUTE-DEFINITION-BOOLEAN-REF></DEFINITION></ATTRIBUTE-VALUE-BOOLEAN>
            <ATTRIBUTE-VALUE-ENUMERATION THE-VALUE="open"><DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>ad-state</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION></ATTRIBUTE-VALUE-ENUMERATION>
            <ATTRIBUTE-VALUE-REAL THE-VALUE="1.5"><DEFINITION><ATTRIBUTE-DEFINITION-REAL-REF>ad-score</ATTRIBUTE-DEFINITION-REAL-REF></DEFINITION></ATTRIBUTE-VALUE-REAL>
            <ATTRIBUTE-VALUE-DATE THE-VALUE="2026-06-14T00:00:00Z"><DEFINITION><ATTRIBUTE-DEFINITION-DATE-REF>ad-date</ATTRIBUTE-DEFINITION-DATE-REF></DEFINITION></ATTRIBUTE-VALUE-DATE>
          </VALUES></SPEC-OBJECT></SPEC-OBJECTS></REQ-IF-CONTENT></CORE-CONTENT></REQ-IF>
        """;
  }
}
