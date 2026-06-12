package com.mnext.kernel.api;

import java.util.Objects;

public record SourceInfo(String type, String ref) {
  public SourceInfo {
    Objects.requireNonNull(type, "type");
  }
}
