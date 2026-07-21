package com.mnext.engines.output.office;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.poi.xwpf.usermodel.XWPFAbstractNum;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTAbstractNum;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STNumberFormat;

final class TiptapDocxBodyRenderer {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private TiptapDocxBodyRenderer() {}

  static void render(XWPFDocument document, String bodyJson) {
    render(document, bodyJson, new DataSet(List.of(), List.of()));
  }

  static void render(XWPFDocument document, String bodyJson, DataSet snapshot) {
    try {
      renderNode(document, MAPPER.readTree(bodyJson), null, snapshot);
    } catch (Exception failure) {
      addPlainParagraph(document, bodyJson);
    }
  }

  private static void renderNode(
      XWPFDocument document, JsonNode node, BigInteger bulletNumId, DataSet snapshot) {
    var type = node.path("type").asText("");
    switch (type) {
      case "doc" -> renderChildren(document, node, bulletNumId, snapshot);
      case "paragraph" -> renderParagraph(document.createParagraph(), node, false);
      case "heading" -> renderHeading(document, node);
      case "bulletList" -> renderBulletList(document, node);
      case "orderedList" -> renderOrderedList(document, node);
      case "dataReference" -> renderReference(document, node, snapshot);
      case "dataTable" -> renderTable(document, node, snapshot);
      default -> addPlainParagraph(document, collectText(node));
    }
  }

  private static void renderChildren(
      XWPFDocument document, JsonNode node, BigInteger bulletNumId, DataSet snapshot) {
    for (var child : node.path("content")) {
      renderNode(document, child, bulletNumId, snapshot);
    }
  }

  private static void renderHeading(XWPFDocument document, JsonNode node) {
    var paragraph = document.createParagraph();
    paragraph.setStyle(
        "Heading" + Math.max(1, Math.min(6, node.path("attrs").path("level").asInt(2) - 1)));
    renderParagraph(paragraph, node, false);
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

  private static void renderOrderedList(XWPFDocument document, JsonNode node) {
    var numbering = document.createNumbering();
    var abstractNum = CTAbstractNum.Factory.newInstance();
    abstractNum.setAbstractNumId(BigInteger.ONE);
    var level = abstractNum.addNewLvl();
    level.setIlvl(BigInteger.ZERO);
    level.addNewNumFmt().setVal(STNumberFormat.DECIMAL);
    level.addNewLvlText().setVal("%1.");
    var numberId = numbering.addNum(numbering.addAbstractNum(new XWPFAbstractNum(abstractNum)));
    for (var item : node.path("content")) {
      for (var child : item.path("content")) {
        if (!"paragraph".equals(child.path("type").asText())) continue;
        var paragraph = document.createParagraph();
        paragraph.setNumID(numberId);
        renderParagraph(paragraph, child, true);
      }
    }
  }

  private static void renderReference(XWPFDocument document, JsonNode node, DataSet snapshot) {
    var config = node.path("attrs").path("config");
    var objectId = config.path("objectId").asText("");
    var fieldCode = config.path("fieldCode").asText("");
    var object =
        snapshot.objects().stream().filter(value -> value.objectId().equals(objectId)).findFirst();
    if (object.isEmpty() && "document-root".equals(config.path("objectBinding").asText())) {
      var type = config.path("objectTypeCode").asText("");
      object =
          snapshot.objects().stream()
              .filter(value -> type.isBlank() || type.equals(value.objectTypeCode()))
              .filter(
                  value ->
                      value.fields().get("_tree") instanceof Map<?, ?> tree
                          && "0".equals(String.valueOf(tree.get("depth"))))
              .findFirst();
    }
    var text = object.map(value -> referenceValue(value, fieldCode)).orElse("引用对象不存在");
    addPlainParagraph(document, text);
  }

  private static String referenceValue(DataObject object, String fieldCode) {
    var objectStatus = object.status();
    if (objectStatus != null
        && List.of("VOID", "FILED", "DELETED").stream()
            .anyMatch(status -> status.equalsIgnoreCase(objectStatus))) return "引用对象已终态";
    if (fieldCode.isBlank() || !object.fields().containsKey(fieldCode)) return "字段引用已失效";
    var value = valueText(object.fields().get(fieldCode));
    return value.isBlank() ? "暂无数据" : value;
  }

  private static String valueText(Object value) {
    if (value instanceof Map<?, ?> map && map.containsKey("value"))
      return String.valueOf(map.get("value"));
    return String.valueOf(value);
  }

  private static void renderTable(XWPFDocument document, JsonNode node, DataSet snapshot) {
    var config = node.path("attrs").path("config");
    var columns = new ArrayList<JsonNode>();
    config.path("columns").forEach(columns::add);
    if (columns.isEmpty()) {
      addPlainParagraph(document, "数据表格配置不可用");
      return;
    }
    var rows = tableRows(snapshot, config);
    var table = document.createTable(Math.max(1, rows.size()) + 1, columns.size());
    for (var index = 0; index < columns.size(); index++)
      table
          .getRow(0)
          .getCell(index)
          .setText(
              columns
                  .get(index)
                  .path("label")
                  .asText(columns.get(index).path("fieldCode").asText("字段")));
    for (var rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
      for (var columnIndex = 0; columnIndex < columns.size(); columnIndex++) {
        table
            .getRow(rowIndex + 1)
            .getCell(columnIndex)
            .setText(tableCell(rows.get(rowIndex), columns.get(columnIndex), snapshot));
      }
    }
    if (rows.isEmpty()) table.getRow(1).getCell(0).setText("暂无数据");
  }

  private static List<DataObject> tableRows(DataSet snapshot, JsonNode config) {
    var type = config.path("objectTypeCode").asText("");
    if (!"document-root".equals(config.path("scope").asText("workspace")))
      return tableOptions(
          snapshot.objects().stream()
              .filter(object -> type.equals(object.objectTypeCode()))
              .toList(),
          config);
    var relationType = config.path("relationTypeCode").asText("");
    var roots =
        snapshot.objects().stream()
            .filter(
                object ->
                    object.fields().get("_tree") instanceof Map<?, ?> tree
                        && String.valueOf(tree.get("depth")).equals("0"))
            .toList();
    var rows =
        snapshot.relations().stream()
            .filter(relation -> relationType.equals(relation.relationTypeCode()))
            .filter(
                relation ->
                    roots.stream().anyMatch(root -> root.objectId().equals(relation.sourceId())))
            .map(relation -> relation.targetId())
            .map(
                id ->
                    snapshot.objects().stream()
                        .filter(
                            object ->
                                id.equals(object.objectId())
                                    && type.equals(object.objectTypeCode()))
                        .findFirst()
                        .orElseGet(() -> new DataObject(id, type, Map.of(), "MISSING", 0)))
            .toList();
    return tableOptions(rows, config);
  }

  private static List<DataObject> tableOptions(List<DataObject> candidates, JsonNode config) {
    var filter = config.path("filter");
    var filtered =
        candidates.stream()
            .filter(
                object ->
                    !filter.isObject()
                        || String.valueOf(object.fields().get(filter.path("fieldCode").asText()))
                            .equals(filter.path("equals").asText()))
            .toList();
    var sort = config.path("sort");
    if (!sort.isObject())
      return filtered.stream().limit(Math.max(0, config.path("maxRows").asInt(200))).toList();
    var fieldCode = sort.path("fieldCode").asText("");
    var comparator =
        java.util.Comparator.comparing(
            (DataObject object) -> valueText(object.fields().get(fieldCode)));
    if ("desc".equalsIgnoreCase(sort.path("direction").asText("asc")))
      comparator = comparator.reversed();
    return filtered.stream()
        .sorted(comparator)
        .limit(Math.max(0, config.path("maxRows").asInt(200)))
        .toList();
  }

  private static String tableCell(DataObject start, JsonNode column, DataSet snapshot) {
    if ("MISSING".equalsIgnoreCase(start.status())) return "引用对象不存在";
    if (column.path("relationPath").size() > 2) return "数据表格配置不可用";
    var current = start;
    for (var relationType : column.path("relationPath")) {
      var sourceId = current.objectId();
      var next =
          snapshot.relations().stream()
              .filter(
                  relation ->
                      relationType.asText().equals(relation.relationTypeCode())
                          && sourceId.equals(relation.sourceId()))
              .findFirst();
      if (next.isEmpty()) return "引用关系不存在";
      current =
          snapshot.objects().stream()
              .filter(object -> next.get().targetId().equals(object.objectId()))
              .findFirst()
              .orElse(null);
      if (current == null) return "引用对象不存在";
    }
    var currentStatus = current.status();
    if (currentStatus != null
        && List.of("VOID", "FILED", "DELETED").stream()
            .anyMatch(status -> status.equalsIgnoreCase(currentStatus))) return "引用对象已终态";
    var fieldCode = column.path("fieldCode").asText("");
    if (!current.fields().containsKey(fieldCode)) return "字段引用已失效";
    var value = valueText(current.fields().get(fieldCode));
    return value.isBlank() ? "暂无数据" : value;
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
      run.setUnderline(
          hasMark(child, "underline")
              ? org.apache.poi.xwpf.usermodel.UnderlinePatterns.SINGLE
              : org.apache.poi.xwpf.usermodel.UnderlinePatterns.NONE);
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
