package com.mnext.engines.output.office;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

final class DeterministicZip {
  private static final long EPOCH_MILLIS = 0L;

  private DeterministicZip() {}

  static byte[] normalize(byte[] source) throws IOException {
    try (var input = new ZipInputStream(new ByteArrayInputStream(source));
        var output = new ByteArrayOutputStream();
        var zip = new ZipOutputStream(output)) {
      zip.setLevel(Deflater.BEST_COMPRESSION);
      ZipEntry entry;
      while ((entry = input.getNextEntry()) != null) {
        var normalized = new ZipEntry(entry.getName());
        normalized.setMethod(ZipEntry.DEFLATED);
        normalized.setTime(EPOCH_MILLIS);
        zip.putNextEntry(normalized);
        input.transferTo(zip);
        zip.closeEntry();
      }
      zip.finish();
      return output.toByteArray();
    }
  }
}
