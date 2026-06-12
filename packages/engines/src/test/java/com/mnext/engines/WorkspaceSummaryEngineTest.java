package com.mnext.engines;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.mnext.kernel.api.Workspace;
import com.mnext.shared.Identifier;
import org.junit.jupiter.api.Test;

class WorkspaceSummaryEngineTest {
  @Test
  void summarizesWorkspace() {
    var workspace = new Workspace(Identifier.random(), "demo");

    assertEquals("Workspace: demo", new WorkspaceSummaryEngine().summarize(workspace));
  }
}
