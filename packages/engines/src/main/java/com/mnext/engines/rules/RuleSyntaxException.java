package com.mnext.engines.rules;

public class RuleSyntaxException extends RuntimeException {
  private final int position;

  public RuleSyntaxException(String message, int position) {
    super(message + " at position " + position);
    this.position = position;
  }

  public int position() {
    return position;
  }
}
