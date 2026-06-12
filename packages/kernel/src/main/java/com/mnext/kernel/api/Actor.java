package com.mnext.kernel.api;

import java.util.Objects;

public record Actor(String kind, String id, String display) {
  public Actor {
    Objects.requireNonNull(kind, "kind");
    Objects.requireNonNull(id, "id");
  }

  public static Actor user(String id) {
    return new Actor("user", id, null);
  }
}
