package com.mnext.kernel.api;

import java.util.List;

public record CommandResult(
    String commandId,
    CommandStatus status,
    boolean idempotentReplay,
    List<String> events,
    CommandError error) {
  public CommandResult replayed() {
    return new CommandResult(commandId, status, true, events, error);
  }
}
