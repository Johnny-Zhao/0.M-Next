package com.mnext.engines.rules;

import java.util.ArrayList;
import java.util.List;

public interface EvalContext {
  Object fieldValue(String code);

  int relationCount(String type);

  boolean hasRelation(String type);

  default Iterable<EvalContext> traverse(String relType, String dir) {
    return List.of();
  }

  default Iterable<EvalContext> traverseDeep(String relType, String dir, int maxDepth) {
    var result = new ArrayList<EvalContext>();
    var frontier = List.of(this);
    for (var depth = 0; depth < maxDepth; depth++) {
      var next = new ArrayList<EvalContext>();
      for (var context : frontier) {
        for (var child : context.traverse(relType, dir)) {
          result.add(child);
          next.add(child);
        }
      }
      frontier = next;
    }
    return result;
  }
}
