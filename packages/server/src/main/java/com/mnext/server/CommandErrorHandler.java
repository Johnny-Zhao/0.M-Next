package com.mnext.server;

import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class CommandErrorHandler {
  @ExceptionHandler(CommandRejectedException.class)
  ResponseEntity<CommandResult> rejected(CommandRejectedException exception) {
    return response(exception.error());
  }

  @ExceptionHandler(SimulationException.class)
  ResponseEntity<CommandResult> simulation(SimulationException exception) {
    return response(
        new CommandError(
            exception.code(), exception.userMessage(), Map.of(), exception.suggestion()));
  }

  @ExceptionHandler(RuleCommandException.class)
  ResponseEntity<CommandResult> rule(RuleCommandException exception) {
    return response(
        new CommandError(
            exception.code(), exception.userMessage(), Map.of(), exception.suggestion()));
  }

  @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
  ResponseEntity<CommandResult> invalid(Exception exception) {
    return response(
        new CommandError("KERNEL-400-SCHEMA-INVALID", "命令载荷无效", Map.of(), "按命令 Schema 修正载荷后重试"));
  }

  @ExceptionHandler(DataAccessException.class)
  ResponseEntity<CommandResult> transactionFailed(DataAccessException exception) {
    return response(new CommandError("KERNEL-500-TX-FAILED", "事务执行失败", Map.of(), "稍后使用相同幂等键重试"));
  }

  private static ResponseEntity<CommandResult> response(CommandError error) {
    var status = Integer.parseInt(error.code().split("-")[1]);
    var result = new CommandResult(null, CommandStatus.REJECTED, false, List.of(), error);
    return ResponseEntity.status(status).body(result);
  }
}
