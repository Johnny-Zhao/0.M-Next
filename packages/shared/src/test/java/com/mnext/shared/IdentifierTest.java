package com.mnext.shared;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;

class IdentifierTest {
  @Test
  void createsRandomIdentifier() {
    assertNotNull(Identifier.random().value());
  }
}
