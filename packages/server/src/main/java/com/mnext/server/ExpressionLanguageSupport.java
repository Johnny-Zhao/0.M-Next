package com.mnext.server;

import com.mnext.engines.rules.OclParser;
import com.mnext.engines.rules.RuleExpression;
import com.mnext.engines.rules.RuleParser;

final class ExpressionLanguageSupport {
  private static final String OCL_PREFIX = "@@mnext-lang:ocl@@\n";

  private ExpressionLanguageSupport() {}

  static String encode(String source, String lang) {
    return "ocl".equals(language(lang)) ? OCL_PREFIX + source : source;
  }

  static RuleExpression parse(String source) {
    if (source != null && source.startsWith(OCL_PREFIX)) {
      return OclParser.parse(source.substring(OCL_PREFIX.length()));
    }
    return RuleParser.parse(source);
  }

  static String language(String lang) {
    return lang == null || lang.isBlank() ? "m-expr" : lang;
  }
}
