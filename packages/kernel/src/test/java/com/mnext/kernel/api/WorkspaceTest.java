package com.mnext.kernel.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.mnext.shared.Identifier;
import org.junit.jupiter.api.Test;

class WorkspaceTest {
  @Test
  void exposesWorkspaceName() {
    var workspace = new Workspace(Identifier.random(), "demo");

    assertEquals("demo", workspace.name());
  }
}
