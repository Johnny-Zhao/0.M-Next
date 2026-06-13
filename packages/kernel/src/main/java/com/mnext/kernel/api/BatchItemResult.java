package com.mnext.kernel.api;

import java.util.List;

public record BatchItemResult(
    int index, CommandStatus status, CommandError error, List<String> events) {}
