package com.mnext.server;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DiffResult;
import com.mnext.engines.exchange.StructuredDiff;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DiffController {
  private final ReadModelRepository readModel;

  public DiffController(ReadModelRepository readModel) {
    this.readModel = readModel;
  }

  @PostMapping("/workspaces/{workspaceId}/diff")
  public DiffResult diff(
      @PathVariable("workspaceId") UUID workspaceId, @RequestBody DiffRequest request) {
    if ("current".equals(request.base())) {
      return StructuredDiff.diff(
          readModel.dataSet(workspaceId), required(request.other(), "other"));
    }
    if (request.base() != null) throw new IllegalArgumentException("base 仅支持 current");
    return StructuredDiff.diff(required(request.a(), "a"), required(request.b(), "b"));
  }

  private static DataSet required(DataSet value, String name) {
    if (value == null) throw new IllegalArgumentException(name + " 必填");
    return value;
  }
}
