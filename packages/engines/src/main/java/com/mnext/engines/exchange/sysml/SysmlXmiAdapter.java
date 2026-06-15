package com.mnext.engines.exchange.sysml;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.ExchangeAdapter;

public final class SysmlXmiAdapter implements ExchangeAdapter {
  private final SysmlXmiCodec codec = new SysmlXmiCodec();

  @Override
  public String formatId() {
    return "sysml-xmi";
  }

  @Override
  public String mediaType() {
    return "application/xml";
  }

  @Override
  public DataSet importToDataSet(String payload, DataSet current) {
    return SysmlXmiMapper.toDataSet(codec.parse(payload), current);
  }

  @Override
  public String exportFromDataSet(String workspace, String objectType, DataSet dataSet) {
    return codec.serialize(SysmlXmiMapper.toXmi(objectType, dataSet));
  }
}
