package com.mnext.server;

import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DataCatalogQueryController {
  private final DataCatalogRepository catalogs;
  private final WorkspaceAuthorizer authorizer;

  DataCatalogQueryController(DataCatalogRepository catalogs, WorkspaceAuthorizer authorizer) {
    this.catalogs = catalogs;
    this.authorizer = authorizer;
  }

  @GetMapping("/workspaces/{workspaceId}/data-catalog")
  DataCatalogRepository.CatalogView catalog(
      @PathVariable("workspaceId") UUID workspaceId, @RequestHeader("X-Actor-Id") String actorId) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    return catalogs.catalog(workspaceId);
  }
}
