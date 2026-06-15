package com.mnext.engines.output;

import com.mnext.engines.exchange.DataSet;
import java.nio.charset.StandardCharsets;

public final class TestPlainRenderAdapter implements RenderAdapter {
  @Override
  public String formatId() {
    return "plain";
  }

  @Override
  public String mediaType() {
    return "text/plain";
  }

  @Override
  public byte[] render(DataSet snapshot, OutputTemplate template) {
    return ("plain:" + snapshot.objects().size()).getBytes(StandardCharsets.UTF_8);
  }
}
