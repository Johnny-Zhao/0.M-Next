package com.mnext.server;

import com.mnext.engines.exchange.DiffResult;
import com.mnext.engines.exchange.JsonArtifact;
import com.mnext.kernel.api.CommandError;
import java.util.List;

record ExchangeApplyRequest(JsonArtifact artifact, boolean confirmRemovals) {}

record ReqIfApplyRequest(String reqif, boolean confirmRemovals) {}

record GenericExchangeApplyRequest(String payload, boolean confirmRemovals) {}

record ExchangeApplyResult(
    DiffResult diff, List<String> applied, List<ExchangeApplyFailure> unapplied) {}

record ExchangeApplyFailure(String item, CommandError error) {}
