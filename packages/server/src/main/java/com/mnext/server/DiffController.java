package com.mnext.server;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DiffResult;
import com.mnext.engines.exchange.StructuredDiff;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DiffController {
  private final ReadModelRepository readModel;
  private final SnapshotRepository snapshots;

  public DiffController(ReadModelRepository readModel) {
    this(readModel, null);
  }

  @Autowired
  public DiffController(ReadModelRepository readModel, SnapshotRepository snapshots) {
    this.readModel = readModel;
    this.snapshots = snapshots;
  }

  @PostMapping("/workspaces/{workspaceId}/diff")
  public DiffResult diff(
      @PathVariable("workspaceId") UUID workspaceId, @RequestBody DiffRequest request) {
    if ("current".equals(request.base())) {
      return StructuredDiff.diff(
          readModel.dataSet(workspaceId), required(request.other(), "other"));
    }
    if (request.base() != null && request.base().startsWith("snapshot:")) {
      return StructuredDiff.diff(
          snapshot(workspaceId, request.base()), required(request.other(), "other"));
    }
    if (request.base() != null)
      throw new IllegalArgumentException("base 仅支持 current 或 snapshot:{id}");
    return StructuredDiff.diff(required(request.a(), "a"), required(request.b(), "b"));
  }

  private DataSet snapshot(UUID workspaceId, String base) {
    if (snapshots == null) throw new IllegalArgumentException("snapshot base 不可用");
    return snapshots
        .get(workspaceId, UUID.fromString(base.substring("snapshot:".length())))
        .payload();
  }

  private static DataSet required(DataSet value, String name) {
    if (value == null) throw new IllegalArgumentException(name + " 必填");
    return value;
  }
}
