package com.mnext.engines.output;

import com.mnext.engines.exchange.DataSet;
import java.nio.charset.StandardCharsets;

public final class MarkdownRenderAdapter implements RenderAdapter {
  @Override
  public String formatId() {
    return "markdown";
  }

  @Override
  public String mediaType() {
    return "text/markdown; charset=utf-8";
  }

  @Override
  public byte[] render(DataSet snapshot, OutputTemplate template) {
    var objects = RenderSupport.objects(snapshot, template);
    var fields = RenderSupport.fields(objects, template);
    var markdown = new StringBuilder("# Output\n\n");
    for (var object : objects) {
      markdown.append("## ").append(object.objectId()).append("\n\n");
      for (var field : fields) {
        markdown
            .append("- ")
            .append(field)
            .append(": ")
            .append(RenderSupport.text(object.fields().get(field)))
            .append("\n");
      }
      markdown.append("\n");
    }
    return markdown.toString().getBytes(StandardCharsets.UTF_8);
  }
}
