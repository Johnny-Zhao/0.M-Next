package com.mnext.kernel.api.metamodel;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record FieldConstraints(
    Integer minLength,
    Integer maxLength,
    BigDecimal min,
    BigDecimal max,
    String pattern,
    List<String> enumValues,
    String refObjectTypeCode) {
  public Map<String, Object> asMap() {
    var values = new LinkedHashMap<String, Object>();
    if (minLength != null) values.put("minLength", minLength);
    if (maxLength != null) values.put("maxLength", maxLength);
    if (min != null) values.put("min", min);
    if (max != null) values.put("max", max);
    if (pattern != null) values.put("pattern", pattern);
    if (enumValues != null) values.put("enumValues", enumValues);
    if (refObjectTypeCode != null) values.put("refObjectTypeCode", refObjectTypeCode);
    return values;
  }

  public static FieldConstraints empty() {
    return new FieldConstraints(null, null, null, null, null, null, null);
  }
}
