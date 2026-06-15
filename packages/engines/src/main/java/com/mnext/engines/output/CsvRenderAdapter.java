package com.mnext.engines.output;

import com.mnext.engines.exchange.DataSet;
import java.nio.charset.StandardCharsets;

public final class CsvRenderAdapter implements RenderAdapter {
  @Override
  public String formatId() {
    return "csv";
  }

  @Override
  public String mediaType() {
    return "text/csv; charset=utf-8";
  }

  @Override
  public byte[] render(DataSet snapshot, OutputTemplate template) {
    var objects = RenderSupport.objects(snapshot, template);
    var fields = RenderSupport.fields(objects, template);
    var csv = new StringBuilder("objectId");
    fields.forEach(field -> csv.append(",").append(cell(field)));
    csv.append("\n");
    for (var object : objects) {
      csv.append(cell(object.objectId()));
      fields.forEach(
          field -> csv.append(",").append(cell(RenderSupport.text(object.fields().get(field)))));
      csv.append("\n");
    }
    return csv.toString().getBytes(StandardCharsets.UTF_8);
  }

  private static String cell(String value) {
    if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
      return "\"" + value.replace("\"", "\"\"") + "\"";
    }
    return value;
  }
}
