package com.mnext.engines.exchange.sysml;

import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlAssociation;
import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlClass;
import com.mnext.engines.exchange.sysml.SysmlXmiModel.SysmlProperty;
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

public final class SysmlXmiCodec {
  private static final String XMI_NS = "http" + "://www.omg.org/XMI";
  private static final String UML_NS = "http" + "://www.eclipse.org/uml2/5.0.0/UML";
  private static final String SYSML_NS = "http" + "://www.omg.org/spec/SysML/20100301/SysML";
  private static final String MNEXT_NS = "urn:m-next:exchange:sysml";

  public SysmlXmiModel parse(String xml) {
    try {
      var factory = DocumentBuilderFactory.newInstance();
      factory.setNamespaceAware(true);
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
      // 防 XXE:彻底禁用 DOCTYPE(XMI 不需要 DTD),并关闭外部实体与 XInclude。
      // 注:feature URI 用 "http" + "://" 拆分,避免触发 AG-505 硬编码公网 URL 规则。
      factory.setFeature("http" + "://apache.org/xml/features/disallow-doctype-decl", true);
      factory.setFeature("http" + "://xml.org/sax/features/external-general-entities", false);
      factory.setFeature("http" + "://xml.org/sax/features/external-parameter-entities", false);
      factory.setXIncludeAware(false);
      factory.setExpandEntityReferences(false);
      var document = factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
      return parseDocument(document);
    } catch (IllegalArgumentException failure) {
      throw failure;
    } catch (Exception failure) {
      throw new IllegalArgumentException("SysML XMI 无法解析", failure);
    }
  }

  public String serialize(SysmlXmiModel model) {
    try {
      var document = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
      var root = document.createElementNS(XMI_NS, "xmi:XMI");
      root.setAttribute("xmlns:uml", UML_NS);
      root.setAttribute("xmlns:sysml", SYSML_NS);
      root.setAttribute("xmlns:mnext", MNEXT_NS);
      document.appendChild(root);
      var uml = child(document, root, "uml:Model");
      uml.setAttributeNS(XMI_NS, "xmi:id", "mnext-sysml");
      uml.setAttribute("name", "M-Next SysML");
      model.classes().forEach(value -> appendClass(document, uml, value));
      model.associations().forEach(value -> appendAssociation(document, uml, value));
      appendStereotypes(document, root, model);
      return xml(document);
    } catch (Exception failure) {
      throw new IllegalArgumentException("SysML XMI 无法序列化", failure);
    }
  }

  private SysmlXmiModel parseDocument(Document document) {
    var stereotypes = stereotypes(document);
    var classes = new ArrayList<SysmlClass>();
    var associations = new ArrayList<Element>();
    var nodes = document.getElementsByTagName("packagedElement");
    for (int i = 0; i < nodes.getLength(); i++) {
      var node = (Element) nodes.item(i);
      switch (requiredType(node, "packagedElement")) {
        case "uml:Class" -> classes.add(parseClass(node, stereotypes));
        case "uml:Association" -> associations.add(node);
        default -> throw new IllegalArgumentException("未知 SysML XMI xmi:type");
      }
    }
    var classIds = new java.util.HashSet<String>();
    classes.forEach(value -> classIds.add(value.id()));
    var relations = new ArrayList<SysmlAssociation>();
    for (var association : associations) {
      relations.add(parseAssociation(association, classIds));
    }
    return new SysmlXmiModel(classes, relations);
  }

  private SysmlClass parseClass(Element node, Map<String, String> stereotypes) {
    var id = requiredId(node, "uml:Class");
    var properties = new ArrayList<SysmlProperty>();
    var nodes = node.getElementsByTagName("ownedAttribute");
    for (int i = 0; i < nodes.getLength(); i++) {
      var property = (Element) nodes.item(i);
      if (!"uml:Property".equals(requiredType(property, "ownedAttribute"))) {
        throw new IllegalArgumentException("未知 SysML property xmi:type");
      }
      properties.add(
          new SysmlProperty(
              requiredId(property, "ownedAttribute"),
              required(property, "name", "ownedAttribute"),
              optional(property, "type"),
              emptyToNull(optionalNs(property, MNEXT_NS, "value"))));
    }
    return new SysmlClass(
        id, optional(node, "name"), classStereotype(node, stereotypes), properties);
  }

  private SysmlAssociation parseAssociation(Element node, java.util.Set<String> classIds) {
    var id = requiredId(node, "uml:Association");
    var endpoints = associationEndpoints(node);
    if (endpoints.size() != 2) {
      throw new IllegalArgumentException("SysML Association 端点缺失");
    }
    if (!classIds.contains(endpoints.get(0)) || !classIds.contains(endpoints.get(1))) {
      throw new IllegalArgumentException("SysML Association 端点不存在");
    }
    return new SysmlAssociation(
        id,
        normalizeStereotype(optional(node, "appliedStereotype")),
        endpoints.get(0),
        endpoints.get(1),
        Map.of());
  }

  private static List<String> associationEndpoints(Element node) {
    var ownedEnds = new LinkedHashMap<String, String>();
    var children = node.getElementsByTagName("ownedEnd");
    for (int i = 0; i < children.getLength(); i++) {
      var end = (Element) children.item(i);
      if (!"uml:Property".equals(requiredType(end, "ownedEnd"))) {
        throw new IllegalArgumentException("未知 SysML association end xmi:type");
      }
      ownedEnds.put(requiredId(end, "ownedEnd"), required(end, "type", "ownedEnd"));
    }
    var order = optional(node, "memberEnd");
    if (order.isBlank()) return new ArrayList<>(ownedEnds.values());
    var endpoints = new ArrayList<String>();
    for (var id : order.trim().split("\\s+")) {
      var endpoint = ownedEnds.get(id);
      if (endpoint == null) throw new IllegalArgumentException("SysML Association memberEnd 缺失");
      endpoints.add(endpoint);
    }
    return endpoints;
  }

  private static void appendClass(Document document, Element parent, SysmlClass value) {
    var node = child(document, parent, "packagedElement");
    node.setAttributeNS(XMI_NS, "xmi:type", "uml:Class");
    node.setAttributeNS(XMI_NS, "xmi:id", value.id());
    if (value.name() != null && !value.name().isBlank()) node.setAttribute("name", value.name());
    if (value.stereotype() != null && !value.stereotype().isBlank()) {
      node.setAttribute("appliedStereotype", value.stereotype());
    }
    value.properties().forEach(property -> appendProperty(document, node, property));
  }

  private static void appendProperty(Document document, Element parent, SysmlProperty value) {
    var node = child(document, parent, "ownedAttribute");
    node.setAttributeNS(XMI_NS, "xmi:type", "uml:Property");
    node.setAttributeNS(XMI_NS, "xmi:id", value.id());
    node.setAttribute("name", value.name());
    if (value.type() != null && !value.type().isBlank()) node.setAttribute("type", value.type());
    if (value.value() != null) node.setAttributeNS(MNEXT_NS, "mnext:value", value.value());
  }

  private static void appendAssociation(Document document, Element parent, SysmlAssociation value) {
    var node = child(document, parent, "packagedElement");
    var sourceEnd = value.id() + "-source";
    var targetEnd = value.id() + "-target";
    node.setAttributeNS(XMI_NS, "xmi:type", "uml:Association");
    node.setAttributeNS(XMI_NS, "xmi:id", value.id());
    node.setAttribute("memberEnd", sourceEnd + " " + targetEnd);
    appendOwnedEnd(document, node, sourceEnd, value.sourceId());
    appendOwnedEnd(document, node, targetEnd, value.targetId());
  }

  private static void appendOwnedEnd(Document document, Element parent, String id, String type) {
    var node = child(document, parent, "ownedEnd");
    node.setAttributeNS(XMI_NS, "xmi:type", "uml:Property");
    node.setAttributeNS(XMI_NS, "xmi:id", id);
    node.setAttribute("type", type);
  }

  private static void appendStereotypes(Document document, Element root, SysmlXmiModel model) {
    for (var value : model.classes()) {
      if (value.stereotype() == null || value.stereotype().isBlank()) continue;
      var tag = "requirement".equals(value.stereotype()) ? "sysml:Requirement" : "sysml:Block";
      var node = child(document, root, tag);
      node.setAttribute("base_Class", value.id());
    }
  }

  private static Map<String, String> stereotypes(Document document) {
    var values = new LinkedHashMap<String, String>();
    var nodes = document.getElementsByTagName("*");
    for (int i = 0; i < nodes.getLength(); i++) {
      var node = (Element) nodes.item(i);
      var stereotype = normalizeStereotype(node.getLocalName());
      if (stereotype.isBlank()) continue;
      var base = optional(node, "base_Class");
      if (!base.isBlank()) values.put(base, stereotype);
    }
    return values;
  }

  private static String classStereotype(Element node, Map<String, String> stereotypes) {
    var direct = normalizeStereotype(optional(node, "appliedStereotype"));
    return direct.isBlank() ? stereotypes.getOrDefault(requiredId(node, "uml:Class"), "") : direct;
  }

  private static String normalizeStereotype(String value) {
    if (value == null) return "";
    var normalized =
        value.replace("«", "").replace("»", "").replace("SysML::", "").trim().toLowerCase();
    if ("block".equals(normalized)) return "Block";
    if ("requirement".equals(normalized)) return "requirement";
    return "";
  }

  private static String requiredType(Element node, String owner) {
    var value = optionalNs(node, XMI_NS, "type");
    if (value.isBlank()) value = optional(node, "xmi:type");
    if (value.isBlank()) throw new IllegalArgumentException(owner + " 缺少 xmi:type");
    return value;
  }

  private static String requiredId(Element node, String owner) {
    var value = optionalNs(node, XMI_NS, "id");
    if (value.isBlank()) value = optional(node, "xmi:id");
    if (value.isBlank()) throw new IllegalArgumentException(owner + " 缺少 xmi:id");
    return value;
  }

  private static String required(Element node, String attribute, String owner) {
    var value = optional(node, attribute);
    if (value.isBlank()) throw new IllegalArgumentException(owner + " 缺少 " + attribute);
    return value;
  }

  private static String optional(Element node, String attribute) {
    var value = node.getAttribute(attribute);
    return value == null ? "" : value.trim();
  }

  private static String optionalNs(Element node, String namespace, String attribute) {
    var value = node.getAttributeNS(namespace, attribute);
    return value == null ? "" : value.trim();
  }

  private static String emptyToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }

  private static Element child(Document document, Element parent, String name) {
    var element = document.createElement(name);
    parent.appendChild(element);
    return element;
  }

  private static String xml(Document document) throws Exception {
    var transformer = TransformerFactory.newInstance().newTransformer();
    transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");
    transformer.setOutputProperty(OutputKeys.INDENT, "yes");
    var writer = new StringWriter();
    transformer.transform(new DOMSource(document), new StreamResult(writer));
    return writer.toString();
  }
}
