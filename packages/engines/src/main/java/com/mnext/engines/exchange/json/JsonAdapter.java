package com.mnext.engines.exchange.json;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.ArtifactMapper;
import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.ExchangeAdapter;
import com.mnext.engines.exchange.JsonCodec;

public final class JsonAdapter implements ExchangeAdapter {
  private final JsonCodec codec = new JsonCodec(new ObjectMapper());

  @Override
  public String formatId() {
    return "json";
  }

  @Override
  public String mediaType() {
    return "application/json";
  }

  @Override
  public DataSet importToDataSet(String payload, DataSet current) {
    return ArtifactMapper.toDataSet(codec.parse(payload), current);
  }

  @Override
  public String exportFromDataSet(String workspace, String objectType, DataSet dataSet) {
    return codec.serialize(ArtifactMapper.toArtifact(workspace, objectType, dataSet));
  }
}
