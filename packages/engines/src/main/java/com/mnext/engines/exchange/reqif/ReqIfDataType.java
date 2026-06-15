package com.mnext.engines.exchange.reqif;

public enum ReqIfDataType {
  STRING,
  INTEGER,
  BOOLEAN,
  ENUMERATION,
  REAL,
  DATE;

  static ReqIfDataType fromTag(String tag) {
    for (var value : values()) {
      if (tag.endsWith("-" + value.name())) return value;
    }
    throw new IllegalArgumentException("未知 ReqIF datatype: " + tag);
  }

  String suffix() {
    return name();
  }
}
