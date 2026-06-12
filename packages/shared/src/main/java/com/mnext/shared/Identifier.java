package com.mnext.shared;

import java.util.Objects;
import java.util.UUID;

public record Identifier(UUID value) {
  public Identifier {
    Objects.requireNonNull(value, "value");
  }

  public static Identifier random() {
    return new Identifier(UUID.randomUUID());
  }
}
