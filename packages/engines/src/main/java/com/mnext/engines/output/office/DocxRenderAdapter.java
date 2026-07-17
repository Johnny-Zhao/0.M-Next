package com.mnext.engines.output.office;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.output.OutputTemplate;
import com.mnext.engines.output.RenderAdapter;
import com.mnext.engines.output.RenderSupport;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Date;
import java.util.Optional;
import org.apache.poi.xwpf.usermodel.XWPFDocument;

public final class DocxRenderAdapter implements RenderAdapter {
  private static final Date EPOCH = new Date(0L);

  @Override
  public String formatId() {
    return "docx";
  }

  @Override
  public String mediaType() {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  @Override
  public byte[] render(DataSet snapshot, OutputTemplate template) {
    try (var document = new XWPFDocument();
        var out = new ByteArrayOutputStream()) {
      if (DocxTreeRenderer.supports(snapshot)) {
        DocxTreeRenderer.render(document, snapshot, template);
      } else {
        renderFlat(document, snapshot, template);
      }
      var properties = document.getProperties().getCoreProperties();
      properties.setCreated(Optional.of(EPOCH));
      properties.setModified(Optional.of(EPOCH));
      document.write(out);
      return DeterministicZip.normalize(out.toByteArray());
    } catch (IOException failure) {
      throw new IllegalStateException("Failed to render docx output", failure);
    }
  }

  private void renderFlat(XWPFDocument document, DataSet snapshot, OutputTemplate template) {
    document.createParagraph().createRun().setText("Output");
    var objects = RenderSupport.objects(snapshot, template);
    var fields = RenderSupport.fields(objects, template);
    var table = document.createTable(Math.max(1, objects.size() + 1), fields.size() + 1);
    table.getRow(0).getCell(0).setText("objectId");
    for (var i = 0; i < fields.size(); i++) {
      table.getRow(0).getCell(i + 1).setText(fields.get(i));
    }
    for (var rowIndex = 0; rowIndex < objects.size(); rowIndex++) {
      var object = objects.get(rowIndex);
      var row = table.getRow(rowIndex + 1);
      row.getCell(0).setText(object.objectId());
      for (var i = 0; i < fields.size(); i++) {
        row.getCell(i + 1).setText(RenderSupport.text(object.fields().get(fields.get(i))));
      }
    }
  }
}
