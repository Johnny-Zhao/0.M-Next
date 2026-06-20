package com.mnext.server;

import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.server.storage.StorageBackend;
import jakarta.servlet.http.HttpServletRequest;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class AttachmentBlobController {
  private static final Set<String> ALLOWED_TYPES =
      Set.of(
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/gif",
          "image/svg+xml",
          "image/webp",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "text/csv",
          "text/plain",
          "application/zip");

  private final StorageBackend storage;
  private final AttachmentRepository attachments;
  private final long maxBytes;

  public AttachmentBlobController(
      StorageBackend storage,
      AttachmentRepository attachments,
      @Value("${mnext.storage.max-bytes:52428800}") long maxBytes) {
    this.storage = storage;
    this.attachments = attachments;
    this.maxBytes = maxBytes;
  }

  @PostMapping("/workspaces/{workspaceId}/attachments/blob")
  public BlobUploadResponse uploadOctet(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader(value = "X-Filename", required = false) String filename,
      HttpServletRequest request)
      throws IOException {
    var contentType = normalizeContentType(request.getContentType(), filename);
    return put(request.getInputStream(), contentType);
  }

  @PostMapping(
      value = "/workspaces/{workspaceId}/attachments/blob",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public BlobUploadResponse uploadMultipart(
      @PathVariable("workspaceId") UUID workspaceId,
      @org.springframework.web.bind.annotation.RequestParam("file") MultipartFile file)
      throws IOException {
    var contentType = normalizeContentType(file.getContentType(), file.getOriginalFilename());
    return put(file.getInputStream(), contentType);
  }

  @GetMapping("/workspaces/{workspaceId}/attachments/{attachmentId}/content")
  public ResponseEntity<InputStreamResource> content(
      @PathVariable("workspaceId") UUID workspaceId,
      @PathVariable("attachmentId") UUID attachmentId)
      throws IOException {
    var attachment = attachments.content(workspaceId, attachmentId);
    if (attachment == null || !attachments.blobExists(attachment.storageKey())) {
      throw new ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
    }
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(attachment.contentType()))
        .contentLength(attachment.sizeBytes())
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(attachment.filename()).build().toString())
        .body(new InputStreamResource(storage.get(attachment.storageKey())));
  }

  private BlobUploadResponse put(InputStream input, String contentType) throws IOException {
    validateType(contentType);
    try {
      var stored = storage.put(new BoundedInputStream(input, maxBytes), contentType);
      return new BlobUploadResponse(
          stored.storageKey(), stored.sha256(), stored.sizeBytes(), stored.contentType());
    } catch (TooLargeException failure) {
      throw error("ATT-413-TOO-LARGE", "附件大小超过上限", Map.of("limit", maxBytes), "压缩或拆分文件后重试");
    }
  }

  private void validateType(String contentType) {
    if (!ALLOWED_TYPES.contains(contentType)) {
      throw error(
          "ATT-415-UNSUPPORTED-TYPE",
          "附件类型不在白名单内",
          Map.of("contentType", contentType),
          "上传已登记的文件类型");
    }
  }

  private static String normalizeContentType(String contentType, String filename) {
    var type = contentType == null ? "" : contentType.split(";", 2)[0].trim().toLowerCase();
    if (!"application/octet-stream".equals(type) && !type.isBlank()) return type;
    return contentTypeFromFilename(filename);
  }

  private static String contentTypeFromFilename(String filename) {
    if (filename == null) return "application/octet-stream";
    var lower = filename.toLowerCase();
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".docx")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    if (lower.endsWith(".xlsx")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    if (lower.endsWith(".pptx")) {
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    }
    if (lower.endsWith(".csv")) return "text/csv";
    if (lower.endsWith(".txt")) return "text/plain";
    if (lower.endsWith(".zip")) return "application/zip";
    return "application/octet-stream";
  }

  private static CommandRejectedException error(
      String code, String message, Map<String, Object> details, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, details, suggestion));
  }

  private static final class BoundedInputStream extends FilterInputStream {
    private final long maxBytes;
    private long count;

    private BoundedInputStream(InputStream input, long maxBytes) {
      super(input);
      this.maxBytes = maxBytes;
    }

    @Override
    public int read() throws IOException {
      var value = super.read();
      if (value != -1) increment(1);
      return value;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
      var read = super.read(buffer, offset, length);
      if (read > 0) increment(read);
      return read;
    }

    private void increment(long delta) throws TooLargeException {
      count += delta;
      if (count > maxBytes) throw new TooLargeException();
    }
  }

  private static final class TooLargeException extends IOException {}
}
