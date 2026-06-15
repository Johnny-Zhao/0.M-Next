package com.mnext.engines.output.office;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.output.OutputTemplate;
import com.mnext.engines.output.RenderAdapter;
import com.mnext.engines.output.RenderSupport;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;

public final class PdfRenderAdapter implements RenderAdapter {
  @Override
  public String formatId() {
    return "pdf";
  }

  @Override
  public String mediaType() {
    return "application/pdf";
  }

  @Override
  public byte[] render(DataSet snapshot, OutputTemplate template) {
    try (var document = new PDDocument();
        var out = new ByteArrayOutputStream()) {
      var page = new PDPage();
      document.addPage(page);
      writePage(document, page, snapshot, template);
      document.save(out);
      return out.toByteArray();
    } catch (IOException failure) {
      throw new IllegalStateException("Failed to render pdf output", failure);
    }
  }

  private static void writePage(
      PDDocument document, PDPage page, DataSet snapshot, OutputTemplate template)
      throws IOException {
    try (var stream = new PDPageContentStream(document, page)) {
      stream.beginText();
      stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
      stream.setLeading(14);
      stream.newLineAtOffset(50, 740);
      stream.showText("Output");
      for (var line : lines(snapshot, template)) {
        stream.newLine();
        stream.showText(line);
      }
      stream.endText();
    }
  }

  private static java.util.List<String> lines(DataSet snapshot, OutputTemplate template) {
    var objects = RenderSupport.objects(snapshot, template);
    var fields = RenderSupport.fields(objects, template);
    var lines = new java.util.ArrayList<String>();
    for (var object : objects) {
      lines.add(object.objectId());
      for (var field : fields) {
        lines.add(field + ": " + RenderSupport.text(object.fields().get(field)));
      }
    }
    return lines;
  }
}
