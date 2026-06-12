package com.mnext.kernel.internal;

import java.util.List;

record StoredCommand(String commandId, String payloadHash, List<String> eventIds) {}
