package com.mnext.engines.exchange.reqif;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.ExchangeAdapter;

public final class ReqIfAdapter implements ExchangeAdapter {
  private final ReqIfCodec codec = new ReqIfCodec();

  @Override
  public String formatId() {
    return "reqif";
  }

  @Override
  public String mediaType() {
    return "application/xml";
  }

  @Override
  public DataSet importToDataSet(String payload, DataSet current) {
    return ReqIfMapper.toDataSet(codec.parse(payload), current);
  }

  @Override
  public String exportFromDataSet(String workspace, String objectType, DataSet dataSet) {
    return codec.serialize(ReqIfMapper.toReqIf("mnext-" + workspace, objectType, dataSet));
  }
}
