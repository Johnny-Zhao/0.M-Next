package com.mnext.server;

import com.mnext.engines.exchange.DataSet;

public record DiffRequest(DataSet a, DataSet b, String base, DataSet other) {}
