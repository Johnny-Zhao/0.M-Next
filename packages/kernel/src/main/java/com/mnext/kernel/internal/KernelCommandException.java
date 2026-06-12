package com.mnext.kernel.internal;

import com.mnext.kernel.api.CommandError;

public final class KernelCommandException extends RuntimeException {
  private final CommandError error;

  public KernelCommandException(CommandError error) {
    super(error.message());
    this.error = error;
  }

  public CommandError error() {
    return error;
  }
}
