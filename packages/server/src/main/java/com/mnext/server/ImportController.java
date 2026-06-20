package com.mnext.server;

import com.mnext.engines.exchange.office.ImportMapping;
import com.mnext.engines.exchange.office.ImportMapping.ExcelMetadata;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class ImportController {
  private final ImportService imports;
  private final WorkspaceAuthorizer authorizer;

  public ImportController(ImportService imports, WorkspaceAuthorizer authorizer) {
    this.imports = imports;
    this.authorizer = authorizer;
  }

  @PostMapping("/workspaces/{workspaceId}/imports")
  public ImportRegisterResponse registerOctet(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestHeader(value = "X-Filename", required = false) String filename,
      HttpServletRequest request)
      throws IOException {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.WRITE_DATA);
    return imports.register(
        workspaceId, actorId, filename, request.getContentType(), request.getInputStream());
  }

  @PostMapping(
      value = "/workspaces/{workspaceId}/imports",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ImportRegisterResponse registerMultipart(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestParam("file") MultipartFile file)
      throws IOException {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.WRITE_DATA);
    return imports.register(
        workspaceId,
        actorId,
        file.getOriginalFilename(),
        file.getContentType(),
        file.getInputStream());
  }

  @GetMapping("/workspaces/{workspaceId}/imports/{importId}/metadata")
  public ExcelMetadata metadata(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader(value = "X-Actor-Id", required = false) String actorId,
      @PathVariable("importId") UUID importId)
      throws IOException {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    return imports.metadata(workspaceId, importId);
  }

  @PostMapping("/workspaces/{workspaceId}/imports/{importId}/parse")
  public ImportResult parse(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @PathVariable("importId") UUID importId,
      @RequestBody ImportMapping mapping)
      throws IOException {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.WRITE_DATA);
    return imports.parse(workspaceId, importId, mapping, actorId);
  }
}
