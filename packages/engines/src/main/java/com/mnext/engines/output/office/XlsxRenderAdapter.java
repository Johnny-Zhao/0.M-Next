package com.mnext.engines.output.office;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.output.OutputTemplate;
import com.mnext.engines.output.RenderAdapter;
import com.mnext.engines.output.RenderSupport;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

public final class XlsxRenderAdapter implements RenderAdapter {
  @Override
  public String formatId() {
    return "xlsx";
  }

  @Override
  public String mediaType() {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  @Override
  public byte[] render(DataSet snapshot, OutputTemplate template) {
    try (var workbook = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var objects = RenderSupport.objects(snapshot, template);
      var fields = RenderSupport.fields(objects, template);
      var sheet = workbook.createSheet("Output");
      var header = sheet.createRow(0);
      header.createCell(0).setCellValue("objectId");
      for (var i = 0; i < fields.size(); i++) {
        header.createCell(i + 1).setCellValue(fields.get(i));
      }
      for (var rowIndex = 0; rowIndex < objects.size(); rowIndex++) {
        var object = objects.get(rowIndex);
        var row = sheet.createRow(rowIndex + 1);
        row.createCell(0).setCellValue(object.objectId());
        for (var i = 0; i < fields.size(); i++) {
          row.createCell(i + 1)
              .setCellValue(RenderSupport.text(object.fields().get(fields.get(i))));
        }
      }
      workbook.write(out);
      return out.toByteArray();
    } catch (IOException failure) {
      throw new IllegalStateException("Failed to render xlsx output", failure);
    }
  }
}
