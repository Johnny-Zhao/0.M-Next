package com.mnext.server;

final class SimulationException extends RuntimeException {
  private final String code;
  private final String userMessage;
  private final String suggestion;

  SimulationException(String code, String userMessage, String suggestion) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.suggestion = suggestion;
  }

  String code() {
    return code;
  }

  String userMessage() {
    return userMessage;
  }

  String suggestion() {
    return suggestion;
  }
}
