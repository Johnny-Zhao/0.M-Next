package com.mnext.engines.rules;

public interface EvalContext {
  Object fieldValue(String code);

  int relationCount(String type);

  boolean hasRelation(String type);
}
