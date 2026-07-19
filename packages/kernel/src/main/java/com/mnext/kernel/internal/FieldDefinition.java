package com.mnext.kernel.internal;

import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import java.util.UUID;

record FieldDefinition(
    UUID id,
    String code,
    String name,
    boolean required,
    boolean uniqueValue,
    DataType dataType,
    FieldConstraints constraints) {
  FieldDefinition(
      UUID id, String code, boolean required, DataType dataType, FieldConstraints constraints) {
    this(id, code, code, required, false, dataType, constraints);
  }

  FieldDefinition(UUID id, String code, boolean required) {
    this(id, code, code, required, false, DataType.STRING, FieldConstraints.empty());
  }
}
