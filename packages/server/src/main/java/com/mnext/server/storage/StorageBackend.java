package com.mnext.server.storage;

import java.io.IOException;
import java.io.InputStream;

public interface StorageBackend {
  StoredBlob put(InputStream in, String contentType) throws IOException;

  InputStream get(String storageKey) throws IOException;

  boolean exists(String storageKey);

  Stat stat(String storageKey) throws IOException;

  record StoredBlob(String storageKey, String sha256, long sizeBytes, String contentType) {}

  record Stat(String storageKey, String sha256, long sizeBytes) {}
}
