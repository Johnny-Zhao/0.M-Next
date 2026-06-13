package com.mnext.engines.review;

import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import java.util.Map;

final class ReviewErrors {
  private ReviewErrors() {}

  static CommandRejectedException reject(String code, String message, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, Map.of(), suggestion));
  }

  static CommandRejectedException targetNotFound() {
    return reject("REVIEW-404-TARGET-NOT-FOUND", "评审目标不存在", "确认目标与工作空间后重试");
  }

  static CommandRejectedException invalidState() {
    return reject("REVIEW-409-INVALID-STATE-TRANSITION", "批注状态不允许此操作", "刷新批注状态后重试");
  }

  static CommandRejectedException schema(String message) {
    return reject("REVIEW-400-SCHEMA-INVALID", message, "按评审命令 Schema 修正载荷后重试");
  }

  static CommandRejectedException fieldCodeRequired() {
    return reject("REVIEW-422-FIELD-CODE-REQUIRED", "字段级批注必须提供 fieldCode", "提供目标字段编码后重试");
  }
}
