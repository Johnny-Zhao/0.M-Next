package com.mnext.kernel.api;

import com.mnext.shared.Identifier;
import java.util.Objects;

public record Workspace(Identifier id, String name) {
  public Workspace {
    Objects.requireNonNull(id, "id");
    if (name == null || name.isBlank()) {
      throw new IllegalArgumentException("name must not be blank");
    }
  }
}
