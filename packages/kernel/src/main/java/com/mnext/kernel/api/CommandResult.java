package com.mnext.kernel.api;

import java.util.List;

public record CommandResult(
    String commandId,
    CommandStatus status,
    boolean idempotentReplay,
    List<String> events,
    CommandError error,
    List<BatchItemResult> results) {
  public CommandResult(
      String commandId,
      CommandStatus status,
      boolean idempotentReplay,
      List<String> events,
      CommandError error) {
    this(commandId, status, idempotentReplay, events, error, null);
  }

  public CommandResult replayed() {
    return new CommandResult(commandId, status, true, events, error, results);
  }
}
