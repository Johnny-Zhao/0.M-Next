package com.mnext.engines.exchange;

public interface ExchangeAdapter {
  String formatId();

  String mediaType();

  DataSet importToDataSet(String payload, DataSet current);

  String exportFromDataSet(String workspace, String objectType, DataSet dataSet);
}
