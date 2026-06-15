package com.mnext.engines.exchange.reqif;

import com.mnext.engines.exchange.reqif.ReqIfDocument.AttributeDef;
import com.mnext.engines.exchange.reqif.ReqIfDocument.DatatypeDef;
import com.mnext.engines.exchange.reqif.ReqIfDocument.SpecObject;
import com.mnext.engines.exchange.reqif.ReqIfDocument.SpecObjectType;
import com.mnext.engines.exchange.reqif.ReqIfDocument.SpecRelation;
import com.mnext.engines.exchange.reqif.ReqIfDocument.SpecRelationType;
import java.io.StringReader;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.xml.sax.InputSource;

public final class ReqIfCodec {
  public ReqIfDocument parse(String xml) {
    try {
      var factory = DocumentBuilderFactory.newInstance();
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
      factory.setExpandEntityReferences(false);
      var document = factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
      return parseDocument(document);
    } catch (IllegalArgumentException failure) {
      throw failure;
    } catch (Exception failure) {
      throw new IllegalArgumentException("ReqIF XML 无法解析", failure);
    }
  }

  public String serialize(ReqIfDocument reqif) {
    try {
      var document = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
      var root = document.createElement("REQ-IF");
      document.appendChild(root);
      appendHeader(document, root, reqif.identifier());
      appendContent(document, root, reqif);
      var transformer = TransformerFactory.newInstance().newTransformer();
      transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");
      transformer.setOutputProperty(OutputKeys.INDENT, "yes");
      var writer = new StringWriter();
      transformer.transform(new DOMSource(document), new StreamResult(writer));
      return writer.toString();
    } catch (Exception failure) {
      throw new IllegalArgumentException("ReqIF XML 无法序列化", failure);
    }
  }

  private ReqIfDocument parseDocument(Document document) {
    rejectUnsupportedTags(document);
    var datatypes = datatypes(document);
    var datatypesById = new LinkedHashMap<String, DatatypeDef>();
    datatypes.forEach(value -> datatypesById.put(value.identifier(), value));
    var objectTypes = objectTypes(document, datatypesById);
    var relationTypes = relationTypes(document);
    var objects = objects(document, objectTypes);
    var objectIds = new java.util.HashSet<String>();
    objects.forEach(value -> objectIds.add(value.identifier()));
    var relations = relations(document, relationTypes, objectIds);
    return new ReqIfDocument(
        headerId(document), datatypes, objectTypes, objects, relationTypes, relations);
  }

  private static void rejectUnsupportedTags(Document document) {
    var allowed = new java.util.HashSet<String>();
    allowed.addAll(datatypeTags());
    allowed.addAll(datatypeRefTags());
    allowed.addAll(attributeDefinitionTags());
    allowed.addAll(attributeValueTags());
    allowed.addAll(attributeDefinitionRefTags());
    var nodes = document.getElementsByTagName("*");
    for (int i = 0; i < nodes.getLength(); i++) {
      var tag = ((Element) nodes.item(i)).getTagName();
      if ((tag.startsWith("DATATYPE-DEFINITION-")
              || tag.startsWith("ATTRIBUTE-DEFINITION-")
              || tag.startsWith("ATTRIBUTE-VALUE-"))
          && !allowed.contains(tag)) {
        throw new IllegalArgumentException("未知 ReqIF 标签: " + tag);
      }
    }
  }

  private static String headerId(Document document) {
    var headers = document.getElementsByTagName("REQ-IF-HEADER");
    if (headers.getLength() == 0) return "reqif";
    return required((Element) headers.item(0), "IDENTIFIER", "REQ-IF-HEADER");
  }

  private static ArrayList<DatatypeDef> datatypes(Document document) {
    var values = new ArrayList<DatatypeDef>();
    for (var tag : datatypeTags()) {
      var nodes = document.getElementsByTagName(tag);
      for (int i = 0; i < nodes.getLength(); i++) {
        var node = (Element) nodes.item(i);
        values.add(
            new DatatypeDef(
                required(node, "IDENTIFIER", tag), longName(node), ReqIfDataType.fromTag(tag)));
      }
    }
    return values;
  }

  private static ArrayList<SpecObjectType> objectTypes(
      Document document, Map<String, DatatypeDef> datatypes) {
    var values = new ArrayList<SpecObjectType>();
    var nodes = document.getElementsByTagName("SPEC-OBJECT-TYPE");
    for (int i = 0; i < nodes.getLength(); i++) {
      var node = (Element) nodes.item(i);
      values.add(
          new SpecObjectType(
              required(node, "IDENTIFIER", "SPEC-OBJECT-TYPE"),
              longName(node),
              attributeDefs(node, datatypes)));
    }
    return values;
  }

  private static ArrayList<AttributeDef> attributeDefs(
      Element objectType, Map<String, DatatypeDef> datatypes) {
    var values = new ArrayList<AttributeDef>();
    for (var tag : attributeDefinitionTags()) {
      var nodes = objectType.getElementsByTagName(tag);
      for (int i = 0; i < nodes.getLength(); i++) {
        var node = (Element) nodes.item(i);
        var type = ReqIfDataType.fromTag(tag);
        var datatypeRef = firstText(node, "DATATYPE-DEFINITION-" + type.suffix() + "-REF");
        if (!datatypes.containsKey(datatypeRef))
          throw new IllegalArgumentException("未知 datatype ref: " + datatypeRef);
        values.add(
            new AttributeDef(required(node, "IDENTIFIER", tag), longName(node), datatypeRef, type));
      }
    }
    return values;
  }

  private static ArrayList<SpecRelationType> relationTypes(Document document) {
    var values = new ArrayList<SpecRelationType>();
    var nodes = document.getElementsByTagName("SPEC-RELATION-TYPE");
    for (int i = 0; i < nodes.getLength(); i++) {
      var node = (Element) nodes.item(i);
      values.add(
          new SpecRelationType(required(node, "IDENTIFIER", "SPEC-RELATION-TYPE"), longName(node)));
    }
    return values;
  }

  private static ArrayList<SpecObject> objects(
      Document document, java.util.List<SpecObjectType> objectTypes) {
    var types = new LinkedHashMap<String, SpecObjectType>();
    objectTypes.forEach(value -> types.put(value.identifier(), value));
    var values = new ArrayList<SpecObject>();
    var nodes = document.getElementsByTagName("SPEC-OBJECT");
    for (int i = 0; i < nodes.getLength(); i++) {
      var node = (Element) nodes.item(i);
      var typeRef = firstText(node, "SPEC-OBJECT-TYPE-REF");
      var type = types.get(typeRef);
      if (type == null) throw new IllegalArgumentException("未知 SPEC-OBJECT-TYPE: " + typeRef);
      values.add(
          new SpecObject(
              required(node, "IDENTIFIER", "SPEC-OBJECT"),
              longName(node),
              typeRef,
              attributeValues(node, type.attributes())));
    }
    return values;
  }

  private static Map<String, Object> attributeValues(
      Element owner, java.util.List<AttributeDef> defs) {
    var byId = new LinkedHashMap<String, AttributeDef>();
    defs.forEach(value -> byId.put(value.identifier(), value));
    var values = new LinkedHashMap<String, Object>();
    for (var tag : attributeValueTags()) {
      var nodes = owner.getElementsByTagName(tag);
      for (int i = 0; i < nodes.getLength(); i++) {
        var node = (Element) nodes.item(i);
        var definitionRef = firstDefinitionRef(node);
        var def = byId.get(definitionRef);
        if (def == null)
          throw new IllegalArgumentException("未知 ATTRIBUTE-DEFINITION: " + definitionRef);
        values.put(def.longName(), readValue(node, def.dataType()));
      }
    }
    return values;
  }

  private static ArrayList<SpecRelation> relations(
      Document document,
      java.util.List<SpecRelationType> relationTypes,
      java.util.Set<String> objectIds) {
    var types =
        relationTypes.stream()
            .map(SpecRelationType::identifier)
            .collect(java.util.stream.Collectors.toSet());
    var values = new ArrayList<SpecRelation>();
    var nodes = document.getElementsByTagName("SPEC-RELATION");
    for (int i = 0; i < nodes.getLength(); i++) {
      var node = (Element) nodes.item(i);
      var typeRef = firstText(node, "SPEC-RELATION-TYPE-REF");
      if (!types.contains(typeRef))
        throw new IllegalArgumentException("未知 SPEC-RELATION-TYPE: " + typeRef);
      var source = firstText(node, "SPEC-OBJECT-REF");
      var target = nthText(node, "SPEC-OBJECT-REF", 1);
      if (!objectIds.contains(source) || !objectIds.contains(target)) {
        throw new IllegalArgumentException("ReqIF relation endpoint 不存在");
      }
      values.add(
          new SpecRelation(
              required(node, "IDENTIFIER", "SPEC-RELATION"), typeRef, source, target, Map.of()));
    }
    return values;
  }

  private static void appendHeader(Document document, Element root, String identifier) {
    var wrapper = child(document, root, "THE-HEADER");
    var header = child(document, wrapper, "REQ-IF-HEADER");
    header.setAttribute("IDENTIFIER", identifier == null ? "reqif" : identifier);
    child(document, header, "TITLE").setTextContent("M-Next ReqIF");
  }

  private static void appendContent(Document document, Element root, ReqIfDocument reqif) {
    var content = child(document, child(document, root, "CORE-CONTENT"), "REQ-IF-CONTENT");
    var datatypes = child(document, content, "DATATYPES");
    reqif.datatypes().forEach(value -> appendDatatype(document, datatypes, value));
    var specTypes = child(document, content, "SPEC-TYPES");
    reqif.objectTypes().forEach(value -> appendObjectType(document, specTypes, value));
    reqif.relationTypes().forEach(value -> appendRelationType(document, specTypes, value));
    var specObjects = child(document, content, "SPEC-OBJECTS");
    reqif
        .objects()
        .forEach(value -> appendObject(document, specObjects, value, reqif.objectTypes()));
    var specRelations = child(document, content, "SPEC-RELATIONS");
    reqif.relations().forEach(value -> appendRelation(document, specRelations, value));
  }

  private static void appendDatatype(Document document, Element parent, DatatypeDef value) {
    var node = child(document, parent, "DATATYPE-DEFINITION-" + value.dataType().suffix());
    node.setAttribute("IDENTIFIER", value.identifier());
    node.setAttribute("LONG-NAME", value.longName());
  }

  private static void appendObjectType(Document document, Element parent, SpecObjectType value) {
    var node = child(document, parent, "SPEC-OBJECT-TYPE");
    node.setAttribute("IDENTIFIER", value.identifier());
    node.setAttribute("LONG-NAME", value.longName());
    var attributes = child(document, node, "SPEC-ATTRIBUTES");
    value.attributes().forEach(attribute -> appendAttributeDef(document, attributes, attribute));
  }

  private static void appendAttributeDef(Document document, Element parent, AttributeDef value) {
    var node = child(document, parent, "ATTRIBUTE-DEFINITION-" + value.dataType().suffix());
    node.setAttribute("IDENTIFIER", value.identifier());
    node.setAttribute("LONG-NAME", value.longName());
    var type = child(document, node, "TYPE");
    child(document, type, "DATATYPE-DEFINITION-" + value.dataType().suffix() + "-REF")
        .setTextContent(value.datatypeRef());
  }

  private static void appendRelationType(
      Document document, Element parent, SpecRelationType value) {
    var node = child(document, parent, "SPEC-RELATION-TYPE");
    node.setAttribute("IDENTIFIER", value.identifier());
    node.setAttribute("LONG-NAME", value.longName());
  }

  private static void appendObject(
      Document document, Element parent, SpecObject value, java.util.List<SpecObjectType> types) {
    var node = child(document, parent, "SPEC-OBJECT");
    node.setAttribute("IDENTIFIER", value.identifier());
    node.setAttribute("LONG-NAME", value.longName());
    var type = child(document, node, "TYPE");
    child(document, type, "SPEC-OBJECT-TYPE-REF").setTextContent(value.typeRef());
    var values = child(document, node, "VALUES");
    var definitions =
        types.stream()
            .filter(item -> item.identifier().equals(value.typeRef()))
            .findFirst()
            .map(SpecObjectType::attributes)
            .orElse(List.of());
    for (var def : definitions) {
      if (value.values().containsKey(def.longName())) {
        appendAttributeValue(document, values, def, value.values().get(def.longName()));
      }
    }
  }

  private static void appendAttributeValue(
      Document document, Element parent, AttributeDef def, Object value) {
    var node = child(document, parent, "ATTRIBUTE-VALUE-" + def.dataType().suffix());
    node.setAttribute("THE-VALUE", value == null ? "" : String.valueOf(value));
    var definition = child(document, node, "DEFINITION");
    child(document, definition, "ATTRIBUTE-DEFINITION-" + def.dataType().suffix() + "-REF")
        .setTextContent(def.identifier());
  }

  private static void appendRelation(Document document, Element parent, SpecRelation value) {
    var node = child(document, parent, "SPEC-RELATION");
    node.setAttribute("IDENTIFIER", value.identifier());
    var type = child(document, node, "TYPE");
    child(document, type, "SPEC-RELATION-TYPE-REF").setTextContent(value.typeRef());
    var source = child(document, node, "SOURCE");
    child(document, source, "SPEC-OBJECT-REF").setTextContent(value.sourceRef());
    var target = child(document, node, "TARGET");
    child(document, target, "SPEC-OBJECT-REF").setTextContent(value.targetRef());
  }

  private static Element child(Document document, Element parent, String name) {
    var element = document.createElement(name);
    parent.appendChild(element);
    return element;
  }

  private static String required(Element node, String attribute, String owner) {
    var value = node.getAttribute(attribute);
    if (value == null || value.isBlank())
      throw new IllegalArgumentException(owner + " 缺少 " + attribute);
    return value;
  }

  private static String longName(Element node) {
    var value = node.getAttribute("LONG-NAME");
    return value == null || value.isBlank()
        ? required(node, "IDENTIFIER", node.getTagName())
        : value;
  }

  private static String firstDefinitionRef(Element node) {
    for (var tag : attributeDefinitionRefTags()) {
      var value = firstText(node, tag);
      if (!value.isBlank()) return value;
    }
    throw new IllegalArgumentException("ATTRIBUTE-VALUE 缺少 DEFINITION-REF");
  }

  private static Object readValue(Element node, ReqIfDataType type) {
    var value =
        node.hasAttribute("THE-VALUE") ? node.getAttribute("THE-VALUE") : node.getTextContent();
    return switch (type) {
      case STRING, ENUMERATION, DATE -> value;
      case INTEGER -> integer(value);
      case BOOLEAN -> Boolean.parseBoolean(value);
      case REAL -> Double.parseDouble(value);
    };
  }

  private static String firstText(Element node, String tag) {
    return nthText(node, tag, 0);
  }

  private static Object integer(String value) {
    var parsed = Long.parseLong(value);
    if (parsed <= Integer.MAX_VALUE && parsed >= Integer.MIN_VALUE) return (int) parsed;
    return parsed;
  }

  private static String nthText(Element node, String tag, int index) {
    var values = node.getElementsByTagName(tag);
    if (values.getLength() <= index) return "";
    return values.item(index).getTextContent().trim();
  }

  private static java.util.List<String> datatypeTags() {
    return List.of(
        "DATATYPE-DEFINITION-STRING",
        "DATATYPE-DEFINITION-INTEGER",
        "DATATYPE-DEFINITION-BOOLEAN",
        "DATATYPE-DEFINITION-ENUMERATION",
        "DATATYPE-DEFINITION-REAL",
        "DATATYPE-DEFINITION-DATE");
  }

  private static java.util.List<String> attributeDefinitionTags() {
    return List.of(
        "ATTRIBUTE-DEFINITION-STRING",
        "ATTRIBUTE-DEFINITION-INTEGER",
        "ATTRIBUTE-DEFINITION-BOOLEAN",
        "ATTRIBUTE-DEFINITION-ENUMERATION",
        "ATTRIBUTE-DEFINITION-REAL",
        "ATTRIBUTE-DEFINITION-DATE");
  }

  private static java.util.List<String> datatypeRefTags() {
    return List.of(
        "DATATYPE-DEFINITION-STRING-REF",
        "DATATYPE-DEFINITION-INTEGER-REF",
        "DATATYPE-DEFINITION-BOOLEAN-REF",
        "DATATYPE-DEFINITION-ENUMERATION-REF",
        "DATATYPE-DEFINITION-REAL-REF",
        "DATATYPE-DEFINITION-DATE-REF");
  }

  private static java.util.List<String> attributeValueTags() {
    return List.of(
        "ATTRIBUTE-VALUE-STRING",
        "ATTRIBUTE-VALUE-INTEGER",
        "ATTRIBUTE-VALUE-BOOLEAN",
        "ATTRIBUTE-VALUE-ENUMERATION",
        "ATTRIBUTE-VALUE-REAL",
        "ATTRIBUTE-VALUE-DATE",
        "ATTRIBUTE-VALUE-XHTML");
  }

  private static java.util.List<String> attributeDefinitionRefTags() {
    return List.of(
        "ATTRIBUTE-DEFINITION-STRING-REF",
        "ATTRIBUTE-DEFINITION-INTEGER-REF",
        "ATTRIBUTE-DEFINITION-BOOLEAN-REF",
        "ATTRIBUTE-DEFINITION-ENUMERATION-REF",
        "ATTRIBUTE-DEFINITION-REAL-REF",
        "ATTRIBUTE-DEFINITION-DATE-REF");
  }
}
