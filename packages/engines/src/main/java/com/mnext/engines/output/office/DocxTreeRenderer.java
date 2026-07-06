package com.mnext.engines.output.office;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.output.OutputTemplate;
import com.mnext.engines.output.RenderSupport;
import java.math.BigInteger;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFStyle;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTStyle;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTStyles;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STStyleType;

final class DocxTreeRenderer {
  private DocxTreeRenderer() {}

  static boolean supports(DataSet snapshot) {
    return snapshot.objects().stream()
        .anyMatch(object -> object.fields().get("_tree") instanceof Map<?, ?>);
  }

  static void render(XWPFDocument document, DataSet snapshot, OutputTemplate template) {
    ensureHeadingStyles(document);
    for (var object : snapshot.objects()) {
      var tree = tree(object);
      addHeading(document, headingLevel(template, number(tree, "depth", 0)), title(object));
      addBodyContent(document, object);
      addParagraphFields(document, object, template);
      addParameterTable(document, object, template);
    }
    addValidationSummary(document, snapshot.objects());
  }

  private static void ensureHeadingStyles(XWPFDocument document) {
    var styles = document.createStyles();
    if (styles.getCtStyles() == null) styles.setStyles(CTStyles.Factory.newInstance());
    for (var level = 1; level <= 6; level++) {
      var styleId = "Heading" + level;
      if (styles.styleExist(styleId)) continue;
      var style = CTStyle.Factory.newInstance();
      style.setStyleId(styleId);
      style.setType(STStyleType.PARAGRAPH);
      style.addNewName().setVal("heading " + level);
      style.addNewBasedOn().setVal("Normal");
      style.addNewNext().setVal("Normal");
      style.addNewUiPriority().setVal(BigInteger.valueOf(8L + level));
      style.addNewQFormat();
      style.addNewPPr().addNewOutlineLvl().setVal(BigInteger.valueOf(level - 1L));
      style.addNewRPr().addNewB();
      styles.addStyle(new XWPFStyle(style));
    }
  }

  private static void addHeading(XWPFDocument document, int level, String text) {
    var paragraph = document.createParagraph();
    paragraph.setStyle("Heading" + level);
    paragraph.createRun().setText(text);
  }

  private static int headingLevel(OutputTemplate template, int depth) {
    var mapping =
        template.sectionMapping() == null
            ? Map.<Integer, Integer>of()
            : template.sectionMapping().headingLevels();
    var configured = mapping.getOrDefault(depth, depth + 1);
    return Math.max(1, Math.min(6, configured));
  }

  private static String title(DataObject object) {
    for (var field : List.of("name", "title", "code")) {
      var text = RenderSupport.text(object.fields().get(field)).trim();
      if (!text.isEmpty()) return text;
    }
    // 文案红线:无 name/title/code 时用可读兜底,绝不把 objectId/UUID 当标题输出。
    return "未命名方案";
  }

  private static void addParagraphFields(
      XWPFDocument document, DataObject object, OutputTemplate template) {
    var roles = fieldRoles(template);
    object
        .fields()
        .forEach(
            (field, value) -> {
              if (visible(field) && paragraphField(field, value, roles)) {
                var text = RenderSupport.text(value).trim();
                if (!text.isEmpty()) document.createParagraph().createRun().setText(text);
              }
            });
  }

  private static void addParameterTable(
      XWPFDocument document, DataObject object, OutputTemplate template) {
    var rows =
        object.fields().entrySet().stream()
            .filter(entry -> parameterField(entry.getKey(), entry.getValue(), template))
            .toList();
    if (rows.isEmpty()) return;
    var table = document.createTable(rows.size() + 1, 2);
    table.getRow(0).getCell(0).setText("字段名");
    table.getRow(0).getCell(1).setText("值");
    for (var index = 0; index < rows.size(); index++) {
      table.getRow(index + 1).getCell(0).setText(fieldLabel(rows.get(index).getKey(), template));
      table.getRow(index + 1).getCell(1).setText(RenderSupport.text(rows.get(index).getValue()));
    }
  }

  private static boolean parameterField(String field, Object value, OutputTemplate template) {
    var roles = fieldRoles(template);
    var role = roles.get(field);
    if (!visible(field) || bodyField(field) || paragraphField(field, value, roles)) return false;
    return "table".equals(role) || value instanceof Number;
  }

  private static boolean paragraphField(String field, Object value, Map<String, String> roles) {
    if (bodyField(field)) return false;
    var role = roles.get(field);
    if ("paragraph".equals(role)) return true;
    if ("table".equals(role)) return false;
    return defaultParagraphField(field, value);
  }

  private static boolean defaultParagraphField(String field, Object value) {
    if (!(value instanceof String text)) return false;
    return List.of("description", "responsibility", "conclusion").contains(field)
        || text.trim().length() > 20;
  }

  private static void addValidationSummary(XWPFDocument document, List<DataObject> objects) {
    var title = document.createParagraph().createRun();
    title.setBold(true);
    title.setText("校核结论");
    var rows =
        objects.stream()
            .map(
                object ->
                    Map.entry(title(object), RenderSupport.text(tree(object).get("ruleStatus"))))
            .filter(entry -> !entry.getValue().isBlank() && !"OK".equals(entry.getValue()))
            .toList();
    var table = document.createTable(Math.max(1, rows.size()) + 1, 2);
    table.getRow(0).getCell(0).setText("对象");
    table.getRow(0).getCell(1).setText("状态");
    if (rows.isEmpty()) {
      table.getRow(1).getCell(0).setText("全部校核通过");
      table.getRow(1).getCell(1).setText("");
      return;
    }
    for (var index = 0; index < rows.size(); index++) {
      table.getRow(index + 1).getCell(0).setText(rows.get(index).getKey());
      table.getRow(index + 1).getCell(1).setText(statusLabel(rows.get(index).getValue()));
    }
  }

  private static boolean visible(String field) {
    return !field.startsWith("_");
  }

  private static boolean bodyField(String field) {
    return "body".equals(field);
  }

  private static void addBodyContent(XWPFDocument document, DataObject object) {
    var body = RenderSupport.text(object.fields().get("body")).trim();
    if (!body.isEmpty()) TiptapDocxBodyRenderer.render(document, body);
  }

  private static Map<String, String> fieldRoles(OutputTemplate template) {
    return template.sectionMapping() == null ? Map.of() : template.sectionMapping().fieldRoles();
  }

  private static String fieldLabel(String field, OutputTemplate template) {
    return fieldLabels(template).getOrDefault(field, field);
  }

  private static Map<String, String> fieldLabels(OutputTemplate template) {
    return template.sectionMapping() == null ? Map.of() : template.sectionMapping().fieldLabels();
  }

  private static String statusLabel(String status) {
    return switch (status) {
      case "BLOCK" -> "阻断";
      case "WARN" -> "告警";
      case "UNKNOWN" -> "未校核";
      default -> status;
    };
  }

  private static int number(Map<String, Object> values, String key, int fallback) {
    var value = values.get(key);
    return value instanceof Number number ? number.intValue() : fallback;
  }

  private static Map<String, Object> tree(DataObject object) {
    if (!(object.fields().get("_tree") instanceof Map<?, ?> values)) return Map.of();
    var result = new LinkedHashMap<String, Object>();
    values.forEach((key, value) -> result.put(String.valueOf(key), value));
    return result;
  }
}
