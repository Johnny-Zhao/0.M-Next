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

record XmiProjectSetApplyRequest(List<XmiProjectDocument> documents, boolean confirmRemovals) {}

record XmiProjectDocument(String projectRef, String payload) {}

record XmiProjectSetApplyResult(
    List<XmiProjectApplyResult> projects,
    List<XmiReferenceResolution> resolvedReferences,
    List<XmiReferenceResolution> unresolvedReferences) {}

record XmiProjectApplyResult(String projectRef, ExchangeApplyResult result) {}

record XmiReferenceResolution(
    String sourceProjectRef,
    String sourceXmiId,
    String href,
    String targetProjectRef,
    String targetXmiId,
    String relationTypeCode,
    java.util.UUID relationId,
    String status) {}
