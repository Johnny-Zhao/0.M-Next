package com.mnext.server.storage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class FilesystemStorageBackend implements StorageBackend {
  private final Path root;

  public FilesystemStorageBackend(@Value("${mnext.storage.dir:}") String configuredRoot) {
    var base =
        configuredRoot == null || configuredRoot.isBlank()
            ? Path.of(System.getProperty("java.io.tmpdir"), "mnext-attachments")
            : Path.of(configuredRoot);
    this.root = base.toAbsolutePath().normalize();
  }

  @Override
  public StoredBlob put(InputStream in, String contentType) throws IOException {
    Files.createDirectories(root);
    var temp = Files.createTempFile(root, "upload-", ".tmp");
    try {
      var digest = sha256Digest();
      long size;
      try (var digesting = new DigestInputStream(in, digest)) {
        size = Files.copy(digesting, temp, StandardCopyOption.REPLACE_EXISTING);
      }
      var sha256 = HexFormat.of().formatHex(digest.digest());
      var key = storageKey(sha256);
      var target = resolve(key);
      Files.createDirectories(target.getParent());
      if (!Files.exists(target)) {
        Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
      } else {
        Files.deleteIfExists(temp);
      }
      return new StoredBlob(key, sha256, size, contentType);
    } catch (IOException | RuntimeException failure) {
      Files.deleteIfExists(temp);
      throw failure;
    }
  }

  @Override
  public InputStream get(String storageKey) throws IOException {
    return Files.newInputStream(resolve(storageKey));
  }

  @Override
  public boolean exists(String storageKey) {
    return Files.isRegularFile(resolve(storageKey));
  }

  @Override
  public Stat stat(String storageKey) throws IOException {
    var target = resolve(storageKey);
    return new Stat(storageKey, shaFromKey(storageKey), Files.size(target));
  }

  private Path resolve(String storageKey) {
    if (!storageKey.matches("[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{64}")) {
      throw new IllegalArgumentException("storageKey 无效");
    }
    var target = root.resolve(storageKey).normalize();
    if (!target.startsWith(root)) throw new IllegalArgumentException("storageKey 无效");
    return target;
  }

  private static String storageKey(String sha256) {
    return sha256.substring(0, 2) + "/" + sha256.substring(2, 4) + "/" + sha256;
  }

  private static String shaFromKey(String storageKey) {
    return storageKey.substring(storageKey.lastIndexOf('/') + 1);
  }

  private static MessageDigest sha256Digest() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }
}
