package com.mnext.engines.output;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RenderAdapterTest {
  private final RenderRegistry registry = new RenderRegistry();

  @Test
  void rendersBuiltInFormats() {
    var template = new OutputTemplate("demo", List.of("name", "cost"));

    var html = render("html", template);
    var markdown = render("markdown", template);
    var csv = render("csv", template);

    assertTrue(html.contains("<table>"));
    assertTrue(markdown.contains("# Output"));
    assertTrue(csv.contains("objectId,name,cost"));
    assertTrue(csv.contains("one,First,3"));
  }

  @Test
  void serviceLoaderFindsBuiltInAndTestAdapters() {
    assertEquals("text/html; charset=utf-8", registry.require("html").mediaType());
    assertEquals("text/markdown; charset=utf-8", registry.require("markdown").mediaType());
    assertEquals("text/csv; charset=utf-8", registry.require("csv").mediaType());
    assertEquals("plain:2", render("plain", new OutputTemplate(null, List.of())));
  }

  @Test
  void unknownFormatReportsSchemaError() {
    var failure = assertThrows(IllegalArgumentException.class, () -> registry.require("missing"));

    assertTrue(failure.getMessage().contains("KERNEL-400-SCHEMA-INVALID"));
  }

  private String render(String format, OutputTemplate template) {
    return new String(registry.require(format).render(dataSet(), template), StandardCharsets.UTF_8);
  }

  private static DataSet dataSet() {
    return new DataSet(
        List.of(
            new DataObject("one", "demo", Map.of("name", "First", "cost", 3), "DRAFT", 1),
            new DataObject("two", "other", Map.of("name", "Second"), "DRAFT", 1)),
        List.of());
  }
}
