package com.mnext.engines.exchange;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.sysml.SysmlXmiAdapter;
import com.mnext.engines.exchange.sysml.SysmlXmiCodec;
import com.mnext.engines.exchange.sysml.SysmlXmiMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SysmlXmiExchangeTest {
  private static final String XMI_NS = "http" + "://www.omg.org/XMI";
  private static final String UML_NS = "http" + "://www.eclipse.org/uml2/5.0.0/UML";
  private static final String SYSML_NS = "http" + "://www.omg.org/spec/SysML/20100301/SysML";
  private final SysmlXmiCodec codec = new SysmlXmiCodec();

  @Test
  void serializationRoundTripKeepsDataSetIdentity() {
    var dataSet =
        new DataSet(
            List.of(
                new DataObject(
                    "B1", "sysml_block", Map.of("name", "Engine", "mass", "10kg"), "DRAFT", 2),
                new DataObject("R1", "sysml_requirement", Map.of("name", "Safety"), "DRAFT", 1)),
            List.of(new DataRelation("A1", "uml_association", "B1", "R1", Map.of())));

    var mapped =
        SysmlXmiMapper.toDataSet(
            codec.parse(codec.serialize(SysmlXmiMapper.toXmi(null, dataSet))), dataSet);

    assertEquals(dataSet, mapped);
  }

  @Test
  void parsesBlockStereotypeAndOwnedAttributes() {
    var dataSet = SysmlXmiMapper.toDataSet(codec.parse(blockXmi()), new DataSet(null, null));

    assertEquals("B1", dataSet.objects().getFirst().objectId());
    assertEquals("sysml_block", dataSet.objects().getFirst().objectTypeCode());
    assertEquals("Engine", dataSet.objects().getFirst().fields().get("name"));
    assertEquals("String", dataSet.objects().getFirst().fields().get("mass"));
  }

  @Test
  void resolvesAssociationEndpointsByOwnedEndIds() {
    var dataSet = SysmlXmiMapper.toDataSet(codec.parse(associationXmi()), new DataSet(null, null));

    assertEquals(2, dataSet.objects().size());
    assertEquals("A1", dataSet.relations().getFirst().relationId());
    assertEquals("uml_association", dataSet.relations().getFirst().relationTypeCode());
    assertEquals("B1", dataSet.relations().getFirst().sourceId());
    assertEquals("R1", dataSet.relations().getFirst().targetId());
  }

  @Test
  void rejectsInvalidXmlMissingIdsMissingEndpointsAndUnknownTypes() {
    assertThrows(IllegalArgumentException.class, () -> codec.parse("<xmi:XMI>"));
    assertThrows(
        IllegalArgumentException.class,
        () -> codec.parse(blockXmi().replace("xmi:id=\"B1\"", "name=\"B1\"")));
    assertThrows(
        IllegalArgumentException.class,
        () -> codec.parse(associationXmi().replace("type=\"R1\"", "type=\"MISSING\"")));
    assertThrows(
        IllegalArgumentException.class,
        () -> codec.parse(blockXmi().replace("uml:Class", "uml:Port")));
  }

  @Test
  void adapterRegistryFindsSysmlXmi() {
    var adapter = new AdapterRegistry().require("sysml-xmi");

    assertEquals("application/xml", adapter.mediaType());
    assertEquals(SysmlXmiAdapter.class, adapter.getClass());
  }

  private static String blockXmi() {
    return """
        <xmi:XMI xmlns:xmi="%s"
                 xmlns:uml="%s"
                 xmlns:sysml="%s">
          <uml:Model xmi:id="model">
            <packagedElement xmi:type="uml:Class" xmi:id="B1" name="Engine">
              <ownedAttribute xmi:type="uml:Property" xmi:id="B1-mass" name="mass" type="String"/>
            </packagedElement>
          </uml:Model>
          <sysml:Block base_Class="B1"/>
        </xmi:XMI>
        """
        .formatted(XMI_NS, UML_NS, SYSML_NS);
  }

  private static String associationXmi() {
    return """
        <xmi:XMI xmlns:xmi="%s"
                 xmlns:uml="%s">
          <uml:Model xmi:id="model">
            <packagedElement xmi:type="uml:Class" xmi:id="B1" name="Engine"/>
            <packagedElement xmi:type="uml:Class" xmi:id="R1" name="Safety"/>
            <packagedElement xmi:type="uml:Association" xmi:id="A1" memberEnd="A1-source A1-target">
              <ownedEnd xmi:type="uml:Property" xmi:id="A1-source" type="B1"/>
              <ownedEnd xmi:type="uml:Property" xmi:id="A1-target" type="R1"/>
            </packagedElement>
          </uml:Model>
        </xmi:XMI>
        """
        .formatted(XMI_NS, UML_NS);
  }
}
