package com.mnext.engines.output;

import com.mnext.engines.exchange.DataSet;

public interface RenderAdapter {
  String formatId();

  String mediaType();

  byte[] render(DataSet snapshot, OutputTemplate template);
}
