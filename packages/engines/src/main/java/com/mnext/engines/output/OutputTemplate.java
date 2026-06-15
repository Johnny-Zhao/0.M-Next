package com.mnext.engines.output;

import java.util.List;

public record OutputTemplate(String objectType, List<String> fieldOrder) {
  public OutputTemplate {
    fieldOrder = fieldOrder == null ? List.of() : List.copyOf(fieldOrder);
  }
}
