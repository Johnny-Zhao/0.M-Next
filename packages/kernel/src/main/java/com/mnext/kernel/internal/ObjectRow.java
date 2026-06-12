package com.mnext.kernel.internal;

import java.util.UUID;

record ObjectRow(UUID id, UUID objectTypeId, String status, long version) {}
