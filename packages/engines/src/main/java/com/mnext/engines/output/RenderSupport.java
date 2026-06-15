package com.mnext.engines.output;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

public final class RenderSupport {
  private RenderSupport() {}

  public static List<DataObject> objects(DataSet snapshot, OutputTemplate template) {
    return snapshot.objects().stream()
        .filter(
            value ->
                template.objectType() == null
                    || template.objectType().equals(value.objectTypeCode()))
        .toList();
  }

  public static List<String> fields(List<DataObject> objects, OutputTemplate template) {
    if (!template.fieldOrder().isEmpty()) return template.fieldOrder();
    var fields = new TreeSet<String>();
    objects.forEach(object -> fields.addAll(object.fields().keySet()));
    return new ArrayList<>(fields);
  }

  public static String text(Object value) {
    return value == null ? "" : String.valueOf(value);
  }
}
