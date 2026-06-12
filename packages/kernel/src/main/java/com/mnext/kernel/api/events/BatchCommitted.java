package com.mnext.kernel.api.events;

import java.util.List;

public record BatchCommitted(
    int succeeded, int failed, List<Integer> succeededIndexes, List<Integer> failedIndexes) {}
