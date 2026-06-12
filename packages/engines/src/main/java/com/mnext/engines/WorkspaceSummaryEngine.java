package com.mnext.engines;

import com.mnext.kernel.api.Workspace;

public final class WorkspaceSummaryEngine {
  public String summarize(Workspace workspace) {
    return "Workspace: " + workspace.name();
  }
}
