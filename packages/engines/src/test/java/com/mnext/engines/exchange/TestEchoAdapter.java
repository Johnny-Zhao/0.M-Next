package com.mnext.engines.exchange;

public final class TestEchoAdapter implements ExchangeAdapter {
  @Override
  public String formatId() {
    return "echo";
  }

  @Override
  public String mediaType() {
    return "text/plain";
  }

  @Override
  public DataSet importToDataSet(String payload, DataSet current) {
    return current;
  }

  @Override
  public String exportFromDataSet(String workspace, String objectType, DataSet dataSet) {
    return workspace + ":" + objectType + ":" + dataSet.objects().size();
  }
}
