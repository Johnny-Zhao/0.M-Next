package com.mnext.engines.output.office;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigInteger;
import org.apache.poi.xwpf.usermodel.XWPFAbstractNum;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTAbstractNum;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STNumberFormat;

final class TiptapDocxBodyRenderer {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private TiptapDocxBodyRenderer() {}

  static void render(XWPFDocument document, String bodyJson) {
    try {
      renderNode(document, MAPPER.readTree(bodyJson), null);
    } catch (Exception failure) {
      addPlainParagraph(document, bodyJson);
    }
  }

  private static void renderNode(XWPFDocument document, JsonNode node, BigInteger bulletNumId) {
    var type = node.path("type").asText("");
    switch (type) {
      case "doc" -> renderChildren(document, node, bulletNumId);
      case "paragraph" -> renderParagraph(document.createParagraph(), node, false);
      case "bulletList" -> renderBulletList(document, node);
      default -> addPlainParagraph(document, collectText(node));
    }
  }

  private static void renderChildren(XWPFDocument document, JsonNode node, BigInteger bulletNumId) {
    for (var child : node.path("content")) {
      renderNode(document, child, bulletNumId);
    }
  }

  private static void renderBulletList(XWPFDocument document, JsonNode node) {
    var bulletNumId = bulletNumId(document);
    for (var item : node.path("content")) {
      if (!"listItem".equals(item.path("type").asText())) {
        addPlainParagraph(document, collectText(item));
        continue;
      }
      for (var child : item.path("content")) {
        if ("paragraph".equals(child.path("type").asText())) {
          var paragraph = document.createParagraph();
          paragraph.setNumID(bulletNumId);
          renderParagraph(paragraph, child, true);
        } else {
          addPlainParagraph(document, collectText(child));
        }
      }
    }
  }

  private static BigInteger bulletNumId(XWPFDocument document) {
    var numbering = document.createNumbering();
    var abstractNum = CTAbstractNum.Factory.newInstance();
    abstractNum.setAbstractNumId(BigInteger.ZERO);
    var level = abstractNum.addNewLvl();
    level.setIlvl(BigInteger.ZERO);
    level.addNewNumFmt().setVal(STNumberFormat.BULLET);
    level.addNewLvlText().setVal("\u2022");
    var abstractNumId = numbering.addAbstractNum(new XWPFAbstractNum(abstractNum));
    return numbering.addNum(abstractNumId);
  }

  private static void renderParagraph(XWPFParagraph paragraph, JsonNode node, boolean listItem) {
    for (var child : node.path("content")) {
      if (!"text".equals(child.path("type").asText())) {
        var fallback = collectText(child);
        if (!fallback.isBlank()) paragraph.createRun().setText(fallback);
        continue;
      }
      var text = child.path("text").asText("");
      if (text.isEmpty()) continue;
      var run = paragraph.createRun();
      run.setBold(hasMark(child, "bold"));
      run.setItalic(hasMark(child, "italic"));
      run.setText(text);
    }
    if (!listItem && paragraph.getRuns().isEmpty()) paragraph.createRun().setText("");
  }

  private static boolean hasMark(JsonNode node, String markType) {
    for (var mark : node.path("marks")) {
      if (markType.equals(mark.path("type").asText())) return true;
    }
    return false;
  }

  private static void addPlainParagraph(XWPFDocument document, String text) {
    if (text == null || text.isBlank()) return;
    document.createParagraph().createRun().setText(text);
  }

  private static String collectText(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) return "";
    if (node.has("text")) return node.path("text").asText("");
    var text = new StringBuilder();
    for (var child : node.path("content")) {
      text.append(collectText(child));
    }
    return text.toString();
  }
}
