package com.mnext.engines.output;

import com.mnext.engines.exchange.DataSet;
import java.nio.charset.StandardCharsets;

public final class HtmlRenderAdapter implements RenderAdapter {
  @Override
  public String formatId() {
    return "html";
  }

  @Override
  public String mediaType() {
    return "text/html; charset=utf-8";
  }

  @Override
  public byte[] render(DataSet snapshot, OutputTemplate template) {
    var objects = RenderSupport.objects(snapshot, template);
    var fields = RenderSupport.fields(objects, template);
    var html = new StringBuilder("<!doctype html><html><body><table><thead><tr><th>objectId</th>");
    fields.forEach(field -> html.append("<th>").append(escape(field)).append("</th>"));
    html.append("</tr></thead><tbody>");
    for (var object : objects) {
      html.append("<tr><td>").append(escape(object.objectId())).append("</td>");
      fields.forEach(
          field ->
              html.append("<td>")
                  .append(escape(RenderSupport.text(object.fields().get(field))))
                  .append("</td>"));
      html.append("</tr>");
    }
    html.append("</tbody></table></body></html>");
    return html.toString().getBytes(StandardCharsets.UTF_8);
  }

  private static String escape(String value) {
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }
}
