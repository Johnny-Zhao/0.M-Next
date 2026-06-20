package com.mnext.server;

import java.time.Instant;
import java.util.UUID;

record MemberView(UUID userId, String role, String grantedBy, Instant grantedAt) {}
