package com.mnext.kernel.api.metamodel;

public enum DataType {
  STRING("string"),
  TEXT("text"),
  INTEGER("integer"),
  NUMBER("number"),
  BOOLEAN("boolean"),
  DATE("date"),
  DATETIME("datetime"),
  ENUM("enum"),
  REF("ref"),
  JSON("json");

  private final String code;

  DataType(String code) {
    this.code = code;
  }

  public String code() {
    return code;
  }

  public static DataType fromCode(String code) {
    for (var value : values()) {
      if (value.code.equals(code)) return value;
    }
    throw new IllegalArgumentException("未知 dataType: " + code);
  }
}
