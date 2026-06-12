package com.mnext.kernel.api;

public final class CommandRejectedException extends RuntimeException {
  private final CommandError error;

  public CommandRejectedException(CommandError error) {
    super(error.message());
    this.error = error;
  }

  public CommandError error() {
    return error;
  }
}
